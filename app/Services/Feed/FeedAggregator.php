<?php

namespace App\Services\Feed;

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Mastodon\MastodonFeedService;
use Carbon\Carbon;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Log;

class FeedAggregator
{
    public function __construct(
        private MastodonFeedService $mastodon,
        private BlueskyFeedService $bluesky,
        private PostNormalizer $normalizer,
    ) {}

    public function fetch(User $user, int $limit = 20, ?string $cursor = null, bool $mentionsEnabled = false): array
    {
        $user->loadMissing('socialAccounts');

        $cursors = [];
        if ($cursor) {
            $decoded = base64_decode($cursor, true);
            if ($decoded !== false) {
                $parsed = json_decode($decoded, true);
                if (is_array($parsed)) {
                    $cursors = $parsed;
                }
            }
        }
        $posts = collect();

        $defaultLimit = config('feed.per_provider_limit', 20);

        foreach ($user->socialAccounts as $account) {
            $accountCursor = $cursors[$account->id] ?? null;
            $normalised = [];
            $nextCursor = null;
            $authAccount = null;

            try {
                if ($account->feed_type === 'home' && $account->provider === 'mastodon') {
                    $host = parse_url($account->instance_url, PHP_URL_HOST);
                    $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
                    $statuses = $this->mastodon->getHomeTimeline($account, $perAccountLimit, $accountCursor);

                    $parents = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['in_reply_to_id'] ?? null);
                    // Quote IDs point to foreign posts — they are never in the timeline batch,
                    // so the batch short-circuit inside fetchMastodonStatuses is always bypassed here.
                    $quotes = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['quote_id'] ?? null);

                    $normalised = array_map(function ($s) use ($host, $parents, $quotes, $account, $mentionsEnabled) {
                        $source = $s['reblog'] ?? $s;
                        // $quoteId matches the key used by the extractor above, so $quotes[$quoteId] resolves
                        // the pre-fetched status (or null if unavailable) to pass into the normalizer.
                        $quoteId = $source['quote_id'] ?? null;

                        return $this->normalizer->fromMastodon(
                            $s,
                            $host,
                            $parents[$source['in_reply_to_id'] ?? ''] ?? null,
                            $account->handle,
                            $quoteId ? ($quotes[$quoteId] ?? null) : null,
                            $mentionsEnabled,
                        );
                    }, $statuses);

                    if ($mentionsEnabled) {
                        $normalised = $this->mastodon->resolveMentionProfiles($normalised, $account);
                    }

                    $nextCursor = ! empty($statuses) ? end($statuses)['id'] : null;
                } elseif ($account->feed_type === 'public_mastodon') {
                    $host = parse_url($account->instance_url, PHP_URL_HOST);
                    $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
                    $statuses = $this->mastodon->getPublicTimeline($account->instance_url, $perAccountLimit);

                    if ($statuses === null) {
                        // Instance requires auth — fall back to a home account on the same instance
                        $authAccount = $user->socialAccounts
                            ->where('provider', 'mastodon')
                            ->where('feed_type', 'home')
                            ->first(fn ($a) => parse_url($a->instance_url, PHP_URL_HOST) === $host);

                        if ($authAccount === null) {
                            Log::warning('Public Mastodon instance requires auth with no matching home account', [
                                'account_id' => $account->id,
                                'host' => $host,
                            ]);
                            $account->update(['auth_failed_at' => now()]);

                            continue;
                        }

                        $statuses = $this->mastodon->getHomeTimeline($authAccount, $perAccountLimit, $accountCursor);

                        if ($account->auth_failed_at !== null) {
                            $account->update(['auth_failed_at' => null]);
                        }
                    }

                    $parents = $authAccount !== null
                        ? $this->fetchMastodonStatuses($authAccount, $statuses, fn ($s) => ($s['reblog'] ?? $s)['in_reply_to_id'] ?? null)
                        : [];
                    $quotes = $authAccount !== null
                        ? $this->fetchMastodonStatuses($authAccount, $statuses, fn ($s) => ($s['reblog'] ?? $s)['quote_id'] ?? null)
                        : [];

                    $normalised = array_map(function ($s) use ($host, $parents, $quotes, $mentionsEnabled) {
                        $source = $s['reblog'] ?? $s;
                        $quoteId = $source['quote_id'] ?? null;

                        return $this->normalizer->fromMastodon(
                            $s,
                            $host,
                            $parents[$source['in_reply_to_id'] ?? ''] ?? null,
                            null,
                            $quoteId ? ($quotes[$quoteId] ?? null) : null,
                            $mentionsEnabled,
                        );
                    }, $statuses);

                    if ($mentionsEnabled && $authAccount !== null) {
                        $normalised = $this->mastodon->resolveMentionProfiles($normalised, $authAccount);
                    }

                    $nextCursor = null;
                } elseif ($account->feed_type === 'home') {
                    $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
                    $result = $this->bluesky->getHomeTimeline($account, $perAccountLimit, $accountCursor);
                    $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, $account->handle, $mentionsEnabled), $result['posts']);

                    if ($mentionsEnabled) {
                        $normalised = $this->bluesky->resolveMentionProfiles($normalised, $account);
                    }

                    $nextCursor = $result['cursor'] ?: null;
                } elseif ($account->feed_type === 'bluesky_feed') {
                    $feedUri = $account->getPreference('feed_uri');
                    if (empty($feedUri)) {
                        Log::warning('bluesky_feed account is missing feed_uri', ['account_id' => $account->id]);

                        continue;
                    }

                    $homeAccount = $user->socialAccounts
                        ->where('provider', 'bluesky')
                        ->where('feed_type', 'home')
                        ->sortBy('id')
                        ->first();

                    if ($homeAccount === null) {
                        Log::warning('bluesky_feed account has no associated home account', ['account_id' => $account->id]);

                        continue;
                    }

                    $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
                    $result = $this->bluesky->getFeed($homeAccount, $feedUri, $perAccountLimit, $accountCursor);
                    $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, $homeAccount->handle, $mentionsEnabled), $result['posts']);

                    if ($mentionsEnabled) {
                        $normalised = $this->bluesky->resolveMentionProfiles($normalised, $homeAccount);
                    }

                    $nextCursor = $result['cursor'] ?: null;
                }
            } catch (ConnectionException|RequestException $e) {
                Log::warning('Provider request failed for account', [
                    'account_id' => $account->id,
                    'auth_account_id' => $authAccount?->id,
                    'provider' => $account->provider,
                    'error' => $e->getMessage(),
                ]);

                continue;
            } catch (\Throwable $e) {
                Log::error('Unexpected error fetching feed for account', [
                    'account_id' => $account->id,
                    'auth_account_id' => $authAccount?->id,
                    'provider' => $account->provider,
                    'exception' => $e::class,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ]);

                continue;
            }

            $normalised = $this->applyAgeCutoff($normalised, $this->resolveMaxAgeDays($user, $account));
            $posts = $posts->concat($normalised);
            if ($nextCursor) {
                $cursors[$account->id] = $nextCursor;
            }
        }

        $bufferSize = config('feed.buffer_size', 40);
        $sorted = $posts->sortByDesc('created_at')->values();

        $seen = [];
        $seenBodies = [];

        $deduped = $sorted->filter(function ($post) use (&$seen, &$seenBodies) {
            $key = $post['original_url'] ?: $post['id'];
            if (isset($seen[$key])) {
                return false;
            }
            $seen[$key] = true;

            // Content similarity dedup
            $normBody = $this->normaliseBodyForDedup((string) ($post['body'] ?? ''));
            if (mb_strlen($normBody, 'UTF-8') >= 30) {
                $postTime = strtotime($post['created_at'] ?? '');
                if ($postTime === false) {
                    Log::warning('FeedAggregator: unparseable created_at in dedup', ['post_id' => $post['id'] ?? 'unknown']);
                    $seenBodies[] = [$normBody, 0];

                    return true;
                }
                foreach ($seenBodies as [$existingBody, $existingTime]) {
                    if (abs($postTime - $existingTime) <= 86400) {
                        similar_text($normBody, $existingBody, $pct);
                        if ($pct >= 80.0) {
                            return false;
                        }
                    }
                }
                $seenBodies[] = [$normBody, $postTime];
            }

            return true;
        })->values()->take($bufferSize)->all();

        $muteWords = $user->getPreference('mute_words', []);
        $deduped = $this->applyMuteWords($deduped, $muteWords);

        $nextCursor = ! empty($deduped) ? base64_encode(json_encode($cursors)) : null;

        return ['posts' => $deduped, 'next_cursor' => $nextCursor];
    }

    private function resolveMaxAgeDays(User $user, SocialAccount $account): ?int
    {
        // Account level: null means "inherit from user" (per SocialAccount defaults design).
        // A non-null value overrides; 0 is treated as "no cutoff".
        $accountStored = is_array($account->feed_settings) ? $account->feed_settings : [];
        if (array_key_exists('max_age_days', $accountStored)) {
            $accountLevel = $accountStored['max_age_days'];

            return ($accountLevel === null || $accountLevel === 0) ? null : (int) $accountLevel;
        }

        // User level: check raw stored prefs so explicit null or 0 disables the cutoff.
        $userStored = is_array($user->feed_preferences) ? $user->feed_preferences : [];
        if (array_key_exists('max_age_days', $userStored)) {
            $userLevel = $userStored['max_age_days'];

            return ($userLevel === null || $userLevel === 0) ? null : (int) $userLevel;
        }

        // User model default (7) is the authoritative fallback.
        return (int) $user->getPreference('max_age_days', 7);
    }

    private function applyAgeCutoff(array $posts, ?int $maxAgeDays): array
    {
        if ($maxAgeDays === null) {
            return $posts;
        }

        $cutoff = now()->subDays($maxAgeDays);

        return array_values(array_filter($posts, function (array $post) use ($cutoff) {
            if (($post['boosted_by'] ?? null) !== null) {
                return true;
            }

            $createdAt = $post['created_at'] ?? null;
            if ($createdAt === null) {
                return false;
            }

            return Carbon::parse($createdAt)->gte($cutoff);
        }));
    }

    private function normaliseBodyForDedup(string $body): string
    {
        $text = mb_strtolower($body, 'UTF-8');
        $text = preg_replace('/https?:\/\/\S+/u', '', $text) ?? $text;
        $text = preg_replace('/#[\p{L}\p{N}_]+/u', '', $text) ?? $text;
        $text = preg_replace('/[^\p{L}\p{N}\s]/u', '', $text) ?? $text;

        return trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
    }

    private function applyMuteWords(array $posts, array $muteWords): array
    {
        if (empty($muteWords)) {
            return $posts;
        }

        return array_values(array_filter($posts, function (array $post) use ($muteWords) {
            $body = mb_strtolower($post['body'], 'UTF-8');
            foreach ($muteWords as $word) {
                if (mb_strpos($body, mb_strtolower($word, 'UTF-8')) !== false) {
                    return false;
                }
            }

            return true;
        }));
    }

    private function fetchMastodonStatuses(SocialAccount $account, array $statuses, callable $idExtractor): array
    {
        $batchById = array_column($statuses, null, 'id');
        $ids = array_filter(array_unique(array_map($idExtractor, $statuses)));

        $result = [];
        foreach ($ids as $id) {
            if (isset($batchById[$id])) {
                $result[$id] = $batchById[$id];
            } else {
                $fetched = $this->mastodon->getStatus($account, $id);
                if ($fetched !== null) {
                    $result[$id] = $fetched;
                }
            }
        }

        return $result;
    }
}
