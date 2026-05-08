<?php

namespace App\Services\Mastodon;

use App\Models\SocialAccount;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

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

    public function getStatus(SocialAccount $account, string $id): ?array
    {
        $key = "mastodon:status:{$account->id}:{$id}";

        return $this->userCache($account)->remember($key, self::STATUS_TTL, function () use ($account, $id) {
            try {
                return Http::timeout(15)->withToken($account->access_token)
                    ->get("{$account->instance_url}/api/v1/statuses/{$id}")
                    ->throw()
                    ->json();
            } catch (\Throwable) {
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

    private function fetchTimeline(SocialAccount $account, array $params): array
    {
        return Http::timeout(15)->withToken($account->access_token)
            ->get("{$account->instance_url}/api/v1/timelines/home", $params)
            ->throw()
            ->json();
    }

    private function userCache(SocialAccount $account)
    {
        return Cache::tags(["user:{$account->user_id}"]);
    }
}
