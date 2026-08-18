<?php

namespace App\Services\Bluesky;

use Illuminate\Support\Facades\Http;

class BlueskyAuthService
{
    private const DEFAULT_PDS = 'https://bsky.social';

    public function createSession(string $identifier, string $appPassword, string $pdsUrl = self::DEFAULT_PDS): array
    {
        $response = Http::post(rtrim($pdsUrl, '/').'/xrpc/com.atproto.server.createSession', [
            'identifier' => $identifier,
            'password' => $appPassword,
        ])->throw()->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
            'handle' => '@'.$response['handle'],
        ];
    }

    public function refreshSession(string $refreshToken, string $pdsUrl = self::DEFAULT_PDS): array
    {
        $response = Http::withToken($refreshToken)
            ->send('POST', rtrim($pdsUrl, '/').'/xrpc/com.atproto.server.refreshSession')
            ->throw()
            ->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
        ];
    }
}
