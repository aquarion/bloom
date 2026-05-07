<?php

namespace App\Services\Mastodon;

use Illuminate\Support\Facades\Http;

class MastodonOAuthService
{
    private const SCOPES = 'read:statuses read:accounts read:follows';

    public function getAuthorizeUrl(string $instance, string $redirectUri): string
    {
        $response = Http::post("{$instance}/api/v1/apps", [
            'client_name' => 'Sprouter',
            'redirect_uris' => $redirectUri,
            'scopes' => self::SCOPES,
            'website' => config('app.url'),
        ])->throw()->json();

        session([
            "mastodon_client_id_{$instance}" => $response['client_id'],
            "mastodon_client_secret_{$instance}" => $response['client_secret'],
        ]);

        return "{$instance}/oauth/authorize?".http_build_query([
            'client_id' => $response['client_id'],
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => self::SCOPES,
        ]);
    }

    public function exchangeCode(
        string $instance,
        string $code,
        string $clientId,
        string $clientSecret,
        string $redirectUri,
    ): array {
        $tokenResponse = Http::post("{$instance}/oauth/token", [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
            'code' => $code,
            'scope' => self::SCOPES,
        ])->throw()->json();

        $accountResponse = Http::withToken($tokenResponse['access_token'])
            ->get("{$instance}/api/v1/accounts/verify_credentials")
            ->throw()->json();

        $host = parse_url($instance, PHP_URL_HOST);

        return [
            'access_token' => $tokenResponse['access_token'],
            'handle' => "@{$accountResponse['acct']}@{$host}",
        ];
    }
}
