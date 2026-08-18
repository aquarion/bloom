<?php

namespace App\Services\Bluesky;

use Illuminate\Support\Facades\Http;

class BlueskyAuthService
{
    private const DEFAULT_PDS = 'https://bsky.social';

    /**
     * Redirects are disabled on every call in this service: SafeInstanceUrl validates the
     * PDS host before we ever get here, but Guzzle follows redirects by default, which would
     * let a malicious PDS point us at an internal host post-validation. This does not close
     * the narrower DNS-rebinding gap (the validated host resolving to a different, private IP
     * by the time this request actually connects) — that would require pinning the resolved
     * IP at the transport layer, which is a larger change left as a follow-up.
     */
    private const NO_REDIRECTS = ['allow_redirects' => false];

    public function createSession(string $identifier, string $appPassword, string $pdsUrl = self::DEFAULT_PDS): array
    {
        $response = Http::withOptions(self::NO_REDIRECTS)
            ->post(rtrim($pdsUrl, '/').'/xrpc/com.atproto.server.createSession', [
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
            ->withOptions(self::NO_REDIRECTS)
            ->send('POST', rtrim($pdsUrl, '/').'/xrpc/com.atproto.server.refreshSession')
            ->throw()
            ->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
        ];
    }
}
