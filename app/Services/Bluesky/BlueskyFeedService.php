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
}
