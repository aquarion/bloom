<?php

namespace App\Services\Bluesky;

use App\Models\SocialAccount;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

class BlueskyFeedService
{
    private const BASE = 'https://bsky.social/xrpc';

    public function __construct(private BlueskyAuthService $auth) {}

    public function getHomeTimeline(SocialAccount $account, int $limit = 20, ?string $cursor = null): array
    {
        $params = ['limit' => $limit];
        if ($cursor !== null) {
            $params['cursor'] = $cursor;
        }

        $response = $this->request($account, fn (string $token) => Http::withToken($token)
            ->get(self::BASE.'/app.bsky.feed.getTimeline', $params)
            ->throw()
            ->json()
        );

        return [
            'posts' => $response['feed'] ?? [],
            'cursor' => $response['cursor'] ?? null,
        ];
    }

    private function request(SocialAccount $account, callable $call): array
    {
        try {
            return $call($account->access_token);
        } catch (RequestException $e) {
            if (($e->response->json('error') ?? '') !== 'ExpiredToken') {
                throw $e;
            }

            $tokens = $this->auth->refreshSession($account->token_secret);

            $account->update([
                'access_token' => $tokens['access_token'],
                'token_secret' => $tokens['refresh_token'],
            ]);

            return $call($tokens['access_token']);
        }
    }
}
