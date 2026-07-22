<?php

namespace App\Services\Bluesky;

use App\Models\SocialAccount;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class BlueskyFeedService
{
    private const BASE = 'https://bsky.social/xrpc';

    private const TIMELINE_TTL = 120; // 2 minutes

    private const PROFILE_TTL = 86400; // 24 hours

    private const DISCOVERY_TTL = 300; // 5 minutes

    private const FEED_GENERATOR_TTL = 86400; // 24 hours

    public function __construct(private BlueskyAuthService $auth) {}

    public function getHomeTimeline(SocialAccount $account, int $limit = 20, ?string $cursor = null): array
    {
        $params = ['limit' => $limit];
        if ($cursor !== null) {
            $params['cursor'] = $cursor;
        }

        $key = 'bluesky:timeline:'.$account->id.':'.($cursor ?? 'head');

        $result = Cache::tags(["user:{$account->user_id}"])->remember($key, self::TIMELINE_TTL, function () use ($account, $params) {
            $response = $this->request($account, fn (string $token) => Http::withToken($token)
                ->get(self::BASE.'/app.bsky.feed.getTimeline', $params)
                ->throw()
                ->json()
            );

            return [
                'posts' => $response['feed'] ?? [],
                'cursor' => $response['cursor'] ?? null,
            ];
        });

        $result['posts'] = $this->enrichWithBanners($result['posts'], $account);

        return $result;
    }

    public function getFeed(SocialAccount $account, string $feedUri, int $limit = 20, ?string $cursor = null): array
    {
        $params = ['feed' => $feedUri, 'limit' => $limit];
        if ($cursor !== null) {
            $params['cursor'] = $cursor;
        }

        $cacheKey = 'bluesky:feed:'.$account->id.':'.md5($feedUri).':'.($cursor ?? 'head');

        $result = Cache::tags(["user:{$account->user_id}"])->remember($cacheKey, self::TIMELINE_TTL, function () use ($account, $params) {
            $response = $this->request($account, fn (string $token) => Http::withToken($token)
                ->get(self::BASE.'/app.bsky.feed.getFeed', $params)
                ->throw()
                ->json()
            );

            return [
                'posts' => $response['feed'] ?? [],
                'cursor' => $response['cursor'] ?? null,
            ];
        });

        $result['posts'] = $this->enrichWithBanners($result['posts'], $account);

        return $result;
    }

    /**
     * Browse or search Bluesky's discoverable feed generators.
     *
     * @return array<int, array{uri: string, display_name: string, description: ?string, avatar: string, creator_handle: ?string, like_count: int}>
     */
    public function searchFeedGenerators(SocialAccount $account, ?string $query, int $limit = 10): array
    {
        $params = ['limit' => $limit];
        if ($query !== null && $query !== '') {
            $params['query'] = $query;
        }

        $cacheKey = 'bluesky:feed-generators:'.md5($query ?? '').':'.$limit;

        return Cache::remember($cacheKey, self::DISCOVERY_TTL, function () use ($account, $params) {
            $response = $this->request($account, fn (string $token) => Http::withToken($token)
                ->get(self::BASE.'/app.bsky.unspecced.getPopularFeedGenerators', $params)
                ->throw()
                ->json()
            );

            return array_map(
                fn (array $view) => $this->mapFeedGeneratorView($view),
                $response['feeds'] ?? [],
            );
        });
    }

    /**
     * Resolve a single feed generator's metadata by its AT URI, so a manually
     * pasted URI can be validated and named the same way a picked-from-search
     * one is. Returns null when the feed doesn't exist or the lookup fails.
     *
     * @return array{uri: string, display_name: string, description: ?string, avatar: string, creator_handle: ?string, like_count: int}|null
     */
    public function resolveFeedGenerator(SocialAccount $account, string $feedUri): ?array
    {
        $cacheKey = 'bluesky:feed-generator:'.md5($feedUri);
        $sentinel = '__unresolved__';

        // Laravel's Cache::get() treats a stored null the same as a cache miss, so a
        // "not found" result is cached as false (never a valid return value here)
        // rather than null — otherwise the negative-cache would never take effect.
        $cached = Cache::get($cacheKey, $sentinel);
        if ($cached !== $sentinel) {
            return $cached === false ? null : $cached;
        }

        try {
            $response = $this->request($account, fn (string $token) => Http::withToken($token)
                ->get(self::BASE.'/app.bsky.feed.getFeedGenerator', ['feed' => $feedUri])
                ->throw()
                ->json()
            );
        } catch (RequestException $e) {
            Cache::put($cacheKey, false, 300);

            return null;
        }

        $view = $response['view'] ?? null;
        $resolved = is_array($view) ? $this->mapFeedGeneratorView($view) : null;

        Cache::put($cacheKey, $resolved ?? false, $resolved ? self::FEED_GENERATOR_TTL : 300);

        return $resolved;
    }

    /**
     * @param  array<string, mixed>  $view
     * @return array{uri: string, display_name: string, description: ?string, avatar: string, creator_handle: ?string, like_count: int}
     */
    private function mapFeedGeneratorView(array $view): array
    {
        return [
            'uri' => $view['uri'] ?? '',
            'display_name' => $view['displayName'] ?? '',
            'description' => $view['description'] ?? null,
            'avatar' => $this->safeUrl($view['avatar'] ?? ''),
            'creator_handle' => $view['creator']['handle'] ?? null,
            'like_count' => $view['likeCount'] ?? 0,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $normalisedPosts
     */
    public function resolveMentionProfiles(array $normalisedPosts, SocialAccount $account): array
    {
        $cache = Cache::tags(["user:{$account->user_id}"]);
        $sentinel = '__uncached__';

        $didsToCheck = [];
        foreach ($normalisedPosts as $post) {
            foreach ($this->collectChipMentions($post) as $mention) {
                if (str_starts_with($mention['profile_url'] ?? '', 'did:')) {
                    $didsToCheck[$mention['profile_url']] = true;
                }
            }
        }

        if (empty($didsToCheck)) {
            return $normalisedPosts;
        }

        $profiles = [];
        $didsToFetch = [];

        foreach (array_keys($didsToCheck) as $did) {
            $cached = $cache->get("bluesky:profile:{$did}:mention", $sentinel);
            if ($cached !== $sentinel) {
                $profiles[$did] = $cached ?: null;
            } else {
                $didsToFetch[] = $did;
            }
        }

        foreach (array_chunk($didsToFetch, 25) as $batch) {
            try {
                $actorQuery = implode('&', array_map(fn ($d) => 'actors='.rawurlencode($d), $batch));

                $response = $this->request($account, fn (string $token) => Http::withToken($token)
                    ->get(self::BASE.'/app.bsky.actor.getProfiles?'.$actorQuery)
                    ->throw()
                    ->json()
                );

                $fetched = [];
                foreach ($response['profiles'] ?? [] as $profile) {
                    $did = $profile['did'];
                    $resolved = [
                        'handle' => $profile['handle'] ?? null,
                        'displayName' => $profile['displayName'] ?? null,
                        'avatar' => $this->safeUrl($profile['avatar'] ?? null) ?: null,
                    ];
                    $profiles[$did] = $resolved;
                    $fetched[$did] = true;
                    $cache->put("bluesky:profile:{$did}:mention", $resolved, self::PROFILE_TTL);
                }

                foreach ($batch as $did) {
                    if (! isset($fetched[$did])) {
                        $profiles[$did] = null;
                        $cache->put("bluesky:profile:{$did}:mention", '', self::PROFILE_TTL);
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch Bluesky profiles for mention resolution', [
                    'account_id' => $account->id,
                    'batch_size' => count($batch),
                    'exception' => $e::class,
                    'error' => $e->getMessage(),
                ]);
                foreach ($batch as $did) {
                    $cache->put("bluesky:profile:{$did}:mention", '', 300);
                }
            }
        }

        $mapMention = function (array $mention) use ($profiles): array {
            $did = $mention['profile_url'] ?? '';
            $profile = $profiles[$did] ?? null;

            if (! is_array($profile) || empty($profile['handle'])) {
                // Unresolved — still give the frontend a navigable, non-blank chip
                // rather than a raw `did:` URI with an empty name.
                return [
                    'handle' => $mention['handle'] ?: $did,
                    'display_name' => $mention['display_name'] ?: $did,
                    'avatar' => $mention['avatar'] ?? '',
                    'profile_url' => str_starts_with($did, 'did:') ? "https://bsky.app/profile/{$did}" : $did,
                ];
            }

            return [
                'handle' => '@'.$profile['handle'],
                'display_name' => $profile['displayName'] ?: $profile['handle'],
                'avatar' => $profile['avatar'] ?? '',
                'profile_url' => "https://bsky.app/profile/{$profile['handle']}",
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

    private function enrichWithBanners(array $feedPosts, SocialAccount $account): array
    {
        $cache = Cache::tags(["user:{$account->user_id}"]);
        $sentinel = '__uncached__';

        $didsToCheck = [];
        foreach ($feedPosts as $feedPost) {
            $author = $feedPost['post']['author'] ?? [];
            if (! isset($author['banner']) && ! empty($author['did'])) {
                $didsToCheck[$author['did']] = true;
            }
        }

        if (empty($didsToCheck)) {
            return $feedPosts;
        }

        $banners = [];
        $didsToFetch = [];

        foreach (array_keys($didsToCheck) as $did) {
            $cached = $cache->get("bluesky:profile:{$did}:banner", $sentinel);
            if ($cached !== $sentinel) {
                $banners[$did] = $cached ?: null;
            } else {
                $didsToFetch[] = $did;
            }
        }

        foreach (array_chunk($didsToFetch, 25) as $batch) {
            try {
                $actorQuery = implode('&', array_map(fn ($d) => 'actors='.rawurlencode($d), $batch));

                $profiles = $this->request($account, fn (string $token) => Http::withToken($token)
                    ->get(self::BASE.'/app.bsky.actor.getProfiles?'.$actorQuery)
                    ->throw()
                    ->json()
                );

                $fetched = [];
                foreach ($profiles['profiles'] ?? [] as $profile) {
                    $did = $profile['did'];
                    $banner = $profile['banner'] ?? null;
                    $banners[$did] = $banner;
                    $fetched[$did] = true;
                    $cache->put("bluesky:profile:{$did}:banner", $banner ?? '', self::PROFILE_TTL);
                }

                foreach ($batch as $did) {
                    if (! isset($fetched[$did])) {
                        $banners[$did] = null;
                        $cache->put("bluesky:profile:{$did}:banner", '', self::PROFILE_TTL);
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch Bluesky profiles for banner enrichment', [
                    'account_id' => $account->id,
                    'batch_size' => count($batch),
                    'exception' => $e::class,
                    'error' => $e->getMessage(),
                ]);
                // Cache a short-TTL negative result so repeated failures don't
                // hammer the endpoint on every timeline refresh during an outage.
                foreach ($batch as $did) {
                    $cache->put("bluesky:profile:{$did}:banner", '', 300);
                }
            }
        }

        return array_map(function (array $feedPost) use ($banners): array {
            $did = $feedPost['post']['author']['did'] ?? null;
            if ($did !== null && ! empty($banners[$did])) {
                $feedPost['post']['author']['banner'] = $banners[$did];
            }

            return $feedPost;
        }, $feedPosts);
    }

    private function request(SocialAccount $account, callable $call): array
    {
        try {
            $result = $call($account->access_token);

            // Clear any previous auth failure on success
            if ($account->auth_failed_at !== null) {
                $account->update(['auth_failed_at' => null]);
            }

            return $result;
        } catch (RequestException $e) {
            if (($e->response->json('error') ?? '') !== 'ExpiredToken') {
                throw $e;
            }

            try {
                $tokens = $this->auth->refreshSession(
                    $account->token_secret,
                    $account->instance_url ?? 'https://bsky.social',
                );
            } catch (RequestException $refreshException) {
                // 4xx means credentials are gone (expired/revoked), not a transient error
                if ($refreshException->response->status() < 500) {
                    $account->update(['auth_failed_at' => now()]);
                }
                throw $refreshException;
            }

            $account->update([
                'access_token' => $tokens['access_token'],
                'token_secret' => $tokens['refresh_token'],
                'auth_failed_at' => null,
            ]);

            return $call($tokens['access_token']);
        }
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
