<?php

namespace App\Services\Feed;

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Support\Facades\Log;

class FeedAggregator
{
    public function __construct(
        private MastodonFeedService $mastodon,
        private BlueskyFeedService $bluesky,
        private PostNormalizer $normalizer,
    ) {}

    public function fetch(User $user, int $limit = 20, ?string $cursor = null): array
    {
        $user->loadMissing('socialAccounts');

        $cursors = $cursor ? json_decode(base64_decode($cursor), true) : [];
        $posts = collect();

        $perProviderLimit = config('feed.per_provider_limit', 20);

        foreach ($user->socialAccounts as $account) {
            $accountCursor = $cursors[$account->id] ?? null;

            try {
                if ($account->provider === 'mastodon') {
                    $host = parse_url($account->instance_url, PHP_URL_HOST);
                    $statuses = $this->mastodon->getHomeTimeline($account, $perProviderLimit, $accountCursor);

                    $parents = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => $s['in_reply_to_id'] ?? null);
                    // Quote IDs point to foreign posts — they are never in the timeline batch,
                    // so the batch short-circuit inside fetchMastodonStatuses is always bypassed here.
                    $quotes = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['quote_id'] ?? null);

                    $normalised = array_map(function ($s) use ($host, $parents, $quotes, $account) {
                        $source = $s['reblog'] ?? $s;
                        // $quoteId matches the key used by the extractor above, so $quotes[$quoteId] resolves
                        // the pre-fetched status (or null if unavailable) to pass into the normalizer.
                        $quoteId = $source['quote_id'] ?? null;

                        return $this->normalizer->fromMastodon(
                            $s,
                            $host,
                            $parents[$s['in_reply_to_id'] ?? ''] ?? null,
                            $account->handle,
                            $quoteId ? ($quotes[$quoteId] ?? null) : null,
                        );
                    }, $statuses);

                    $nextCursor = ! empty($statuses) ? end($statuses)['id'] : null;
                    $posts = $posts->concat($normalised);
                    if ($nextCursor) {
                        $cursors[$account->id] = $nextCursor;
                    }
                }

                if ($account->provider === 'bluesky') {
                    $result = $this->bluesky->getHomeTimeline($account, $perProviderLimit, $accountCursor);
                    $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, $account->handle), $result['posts']);
                    $posts = $posts->concat($normalised);
                    if ($result['cursor']) {
                        $cursors[$account->id] = $result['cursor'];
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch feed for account', [
                    'account_id' => $account->id,
                    'provider' => $account->provider,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $bufferSize = config('feed.buffer_size', 40);
        $sorted = $posts->sortByDesc('created_at')->values()->take($bufferSize)->all();
        $nextCursor = ! empty($sorted) ? base64_encode(json_encode($cursors)) : null;

        return ['posts' => $sorted, 'next_cursor' => $nextCursor];
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
