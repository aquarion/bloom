<?php

namespace App\Services\Mastodon;

use Illuminate\Support\Facades\Http;

class MastodonOAuthService
{
    private const SCOPES = 'read:statuses read:accounts read:follows';

    /**
     * Redirects are disabled on every call in this service: SafeInstanceUrl validates the
     * instance host before we ever get here, but Guzzle follows redirects by default, which
     * would let a malicious instance point us at an internal host post-validation. This does
     * not close the narrower DNS-rebinding gap (the validated host resolving to a different,
     * private IP by the time this request actually connects) — that would require pinning
     * the resolved IP at the transport layer, which is a larger change left as a follow-up.
     */
    private const NO_REDIRECTS = ['allow_redirects' => false];

    public function getAuthorizeUrl(string $instance, string $redirectUri): string
    {
        $response = Http::timeout(15)->withOptions(self::NO_REDIRECTS)->post("{$instance}/api/v1/apps", [
            'client_name' => 'Bloom',
            'redirect_uris' => $redirectUri,
            'scopes' => self::SCOPES,
            'website' => config('app.url'),
        ])->throw()->json();

        $this->storeCredentials($instance, $response['client_id'], $response['client_secret']);

        $state = bin2hex(random_bytes(16));
        session(['mastodon_oauth_state' => $state]);

        return "{$instance}/oauth/authorize?".http_build_query([
            'client_id' => $response['client_id'],
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => self::SCOPES,
            'state' => $state,
        ]);
    }

    public function storeCredentials(string $instance, string $clientId, string $clientSecret): void
    {
        session([
            "mastodon_client_id_{$instance}" => $clientId,
            "mastodon_client_secret_{$instance}" => $clientSecret,
        ]);
    }

    public function getStoredCredentials(string $instance): array
    {
        return [
            'client_id' => session("mastodon_client_id_{$instance}"),
            'client_secret' => session("mastodon_client_secret_{$instance}"),
        ];
    }

    public function exchangeCode(
        string $instance,
        string $code,
        string $clientId,
        string $clientSecret,
        string $redirectUri,
    ): array {
        $tokenResponse = Http::timeout(15)->withOptions(self::NO_REDIRECTS)->post("{$instance}/oauth/token", [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
            'code' => $code,
            'scope' => self::SCOPES,
        ])->throw()->json();

        $accountResponse = Http::timeout(15)->withToken($tokenResponse['access_token'])
            ->withOptions(self::NO_REDIRECTS)
            ->get("{$instance}/api/v1/accounts/verify_credentials")
            ->throw()->json();

        $host = parse_url($instance, PHP_URL_HOST)
            ?: throw new \InvalidArgumentException("Cannot extract host from instance URL: {$instance}");

        return [
            'access_token' => $tokenResponse['access_token'],
            'handle' => "@{$accountResponse['acct']}@{$host}",
        ];
    }
}
