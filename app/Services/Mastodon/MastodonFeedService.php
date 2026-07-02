<?php

namespace App\Services\Mastodon;

use App\Models\SocialAccount;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MastodonFeedService
{
    // How long before the head timeline is considered stale and needs a delta fetch.
    private const TIMELINE_TTL = 120;

    // How long to keep the head timeline data even when stale (avoids full re-fetch).
    private const TIMELINE_DATA_TTL = 86400;

    // How long to cache a paginated timeline page (older pages rarely change).
    private const TIMELINE_PAGE_TTL = 600;

    // How long to cache an individual status (reply parents rarely change).
    private const STATUS_TTL = 900;

    // How long to cache a resolved (or failed) mention-account lookup.
    private const MENTION_PROFILE_TTL = 86400;

    public function getStatus(SocialAccount $account, string $id): ?array
    {
        $key = "mastodon:status:{$account->id}:{$id}";

        return $this->userCache($account)->remember($key, self::STATUS_TTL, function () use ($account, $id) {
            try {
                return Http::timeout(15)->withToken($account->access_token)
                    ->get("{$account->instance_url}/api/v1/statuses/{$id}")
                    ->throw()
                    ->json();
            } catch (RequestException $e) {
                if ($e->response->status() !== 404) {
                    Log::warning('Failed to fetch Mastodon status', [
                        'account_id' => $account->id,
                        'status_id' => $id,
                        'http_status' => $e->response->status(),
                        'error' => $e->getMessage(),
                    ]);
                }

                return null;
            } catch (\Throwable $e) {
                Log::error('Unexpected error fetching Mastodon status', [
                    'account_id' => $account->id,
                    'status_id' => $id,
                    'exception' => $e::class,
                    'error' => $e->getMessage(),
                ]);

                return null;
            }
        });
    }

    public function getHomeTimeline(SocialAccount $account, int $limit = 20, ?string $maxId = null): array
    {
        // Paginated (older) pages: simple cache keyed by cursor.
        if ($maxId !== null) {
            $key = "mastodon:timeline:{$account->id}:{$maxId}";

            return $this->userCache($account)->remember($key, self::TIMELINE_PAGE_TTL, function () use ($account, $limit, $maxId) {
                return $this->fetchTimeline($account, ['limit' => $limit, 'max_id' => $maxId]);
            });
        }

        // Head: incremental fetching using since_id to minimise API calls.
        $cache = $this->userCache($account);
        $dataKey = "mastodon:timeline:{$account->id}:head:data";
        $freshKey = "mastodon:timeline:{$account->id}:head:fresh";

        // Cache is still fresh — return stored list without hitting the API.
        if ($cache->has($freshKey)) {
            return $cache->get($dataKey) ?? [];
        }

        $existing = $cache->get($dataKey);

        if (! empty($existing)) {
            // Fetch only posts newer than the most recent we already have.
            $sinceId = $existing[0]['id'];
            $delta = $this->fetchTimeline($account, ['limit' => $limit, 'since_id' => $sinceId]);

            // since_id returns newest-first, same order as existing — prepend and trim.
            $merged = array_slice(array_merge($delta, $existing), 0, $limit);
        } else {
            // No prior data — full fetch.
            $merged = $this->fetchTimeline($account, ['limit' => $limit]);
        }

        $cache->put($dataKey, $merged, self::TIMELINE_DATA_TTL);
        $cache->put($freshKey, true, self::TIMELINE_TTL);

        return $merged;
    }

    /**
     * Fetch the public timeline for a Mastodon instance without authentication.
     * Returns null if the instance requires auth (401). Cached app-wide (not per-user).
     */
    public function getPublicTimeline(string $instanceUrl, int $limit = 20): ?array
    {
        $host = parse_url($instanceUrl, PHP_URL_HOST) ?? $instanceUrl;
        $dataKey = "mastodon:public:{$host}:head:data";
        $freshKey = "mastodon:public:{$host}:head:fresh";

        if (Cache::has($freshKey)) {
            return Cache::get($dataKey) ?? [];
        }

        $existing = Cache::get($dataKey);
        $params = ['limit' => $limit];

        if (! empty($existing)) {
            $params['since_id'] = $existing[0]['id'];
        }

        $response = Http::timeout(15)
            ->get("{$instanceUrl}/api/v1/timelines/public", $params);

        if ($response->status() === 401) {
            return null;
        }

        if ($response->failed()) {
            Log::warning('Failed to fetch Mastodon public timeline', [
                'instance_url' => $instanceUrl,
                'http_status' => $response->status(),
            ]);
        }

        $response->throw();

        $fetched = $response->json();

        $merged = ! empty($existing)
            ? array_slice(array_merge($fetched, $existing), 0, $limit)
            : $fetched;

        Cache::put($dataKey, $merged, self::TIMELINE_DATA_TTL);
        Cache::put($freshKey, true, self::TIMELINE_TTL);

        return $merged;
    }

    /**
     * @param  array<int, array<string, mixed>>  $normalisedPosts  Posts already shaped by PostNormalizer::fromMastodon, each with a 'chip_mentions' key.
     */
    public function resolveMentionProfiles(array $normalisedPosts, SocialAccount $account): array
    {
        $cache = $this->userCache($account);
        $sentinel = '__uncached__';

        $acctsToCheck = [];
        foreach ($normalisedPosts as $post) {
            foreach ($this->collectChipMentions($post) as $mention) {
                if (($mention['avatar'] ?? '') === '' && ! empty($mention['handle'])) {
                    $acct = ltrim($mention['handle'], '@');
                    $acctsToCheck[$acct] = true;
                }
            }
        }

        if (empty($acctsToCheck)) {
            return $normalisedPosts;
        }

        $resolved = [];

        foreach (array_keys($acctsToCheck) as $acct) {
            $key = "mastodon:mention_profile:{$account->id}:{$acct}";
            $cached = $cache->get($key, $sentinel);

            if ($cached !== $sentinel) {
                $resolved[$acct] = $cached ?: null;

                continue;
            }

            try {
                $response = Http::timeout(10)->withToken($account->access_token)
                    ->get("{$account->instance_url}/api/v1/accounts/lookup", ['acct' => $acct])
                    ->throw()
                    ->json();

                $profile = [
                    'display_name' => $response['display_name'] ?? null,
                    'avatar' => $this->safeUrl($response['avatar'] ?? null) ?: null,
                ];
                $resolved[$acct] = $profile;
                $cache->put($key, $profile, self::MENTION_PROFILE_TTL);
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch Mastodon profile for mention resolution', [
                    'account_id' => $account->id,
                    'acct' => $acct,
                    'exception' => $e::class,
                    'error' => $e->getMessage(),
                ]);
                $resolved[$acct] = null;
                // Cache a short-TTL negative result so repeated failures don't
                // hammer the endpoint, but recover quickly after an outage.
                $cache->put($key, '', 300);
            }
        }

        $mapMention = function (array $mention) use ($resolved): array {
            $acct = ltrim($mention['handle'] ?? '', '@');
            $profile = $resolved[$acct] ?? null;

            if (! is_array($profile)) {
                return $mention;
            }

            return [
                ...$mention,
                'display_name' => $profile['display_name'] ?: $mention['display_name'],
                'avatar' => $profile['avatar'] ?? '',
            ];
        };

        return array_map(function (array $post) use ($mapMention) {
            $post['chip_mentions'] = array_map($mapMention, $post['chip_mentions'] ?? []);

            if (isset($post['reply_to']) && is_array($post['reply_to'])) {
                $post['reply_to']['chip_mentions'] = array_map($mapMention, $post['reply_to']['chip_mentions'] ?? []);
            }

            if (isset($post['quoted_post']) && is_array($post['quoted_post'])) {
                $post['quoted_post']['chip_mentions'] = array_map($mapMention, $post['quoted_post']['chip_mentions'] ?? []);
            }

            return $post;
        }, $normalisedPosts);
    }

    /**
     * @param  array<string, mixed>  $post
     * @return array<int, array<string, mixed>>
     */
    private function collectChipMentions(array $post): array
    {
        $mentions = $post['chip_mentions'] ?? [];

        if (isset($post['reply_to']) && is_array($post['reply_to'])) {
            $mentions = array_merge($mentions, $post['reply_to']['chip_mentions'] ?? []);
        }

        if (isset($post['quoted_post']) && is_array($post['quoted_post'])) {
            $mentions = array_merge($mentions, $post['quoted_post']['chip_mentions'] ?? []);
        }

        return $mentions;
    }

    private function fetchTimeline(SocialAccount $account, array $params): array
    {
        $response = Http::timeout(15)->withToken($account->access_token)
            ->get("{$account->instance_url}/api/v1/timelines/home", $params);

        // 401 means token is revoked — mark the account as needing reconnect
        if ($response->status() === 401) {
            $account->update(['auth_failed_at' => now()]);
        }

        $response->throw(); // throws for any 4xx/5xx

        // Success — clear any previous auth failure flag
        if ($account->auth_failed_at !== null) {
            $account->update(['auth_failed_at' => null]);
        }

        return $response->json();
    }

    private function userCache(SocialAccount $account)
    {
        return Cache::tags(["user:{$account->user_id}"]);
    }

    private function safeUrl(?string $url): string
    {
        if (! $url) {
            return '';
        }

        $scheme = parse_url($url, PHP_URL_SCHEME);

        return in_array($scheme, ['https', 'http'], true) ? $url : '';
    }
}
