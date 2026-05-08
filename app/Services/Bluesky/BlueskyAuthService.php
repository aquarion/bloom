<?php

namespace App\Services\Bluesky;

use Illuminate\Support\Facades\Http;

class BlueskyAuthService
{
    private const BASE = 'https://bsky.social/xrpc';

    public function createSession(string $identifier, string $appPassword): array
    {
        $response = Http::post(self::BASE.'/com.atproto.server.createSession', [
            'identifier' => $identifier,
            'password' => $appPassword,
        ])->throw()->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
            'handle' => '@'.$response['handle'],
        ];
    }

    public function refreshSession(string $refreshToken): array
    {
        // ATProto refreshSession expects an authenticated POST with no request body.
        $response = Http::withToken($refreshToken)
            ->send('POST', self::BASE.'/com.atproto.server.refreshSession')
            ->throw()
            ->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
        ];
    }
}
