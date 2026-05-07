<?php

use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('registers a dynamic client and returns an authorize url', function () {
    Http::fake([
        'fosstodon.org/api/v1/apps' => Http::response([
            'client_id' => 'fake-client-id',
            'client_secret' => 'fake-client-secret', // pragma: allowlist secret
        ]),
    ]);

    $service = new MastodonOAuthService;
    $url = $service->getAuthorizeUrl('https://fosstodon.org', 'https://sprouter.test/auth/mastodon/callback');

    expect($url)->toContain('fosstodon.org/oauth/authorize')
        ->and($url)->toContain('fake-client-id')
        ->and($url)->toContain('code');
});

it('exchanges a code for an access token', function () {
    Http::fake([
        'fosstodon.org/oauth/token' => Http::response([
            'access_token' => 'user-token-abc',
        ]),
        'fosstodon.org/api/v1/accounts/verify_credentials' => Http::response([
            'acct' => 'testuser',
        ]),
    ]);

    $service = new MastodonOAuthService;
    $result = $service->exchangeCode(
        instance: 'https://fosstodon.org',
        code: 'auth-code',
        clientId: 'fake-client-id',
        clientSecret: 'fake-client-secret', // pragma: allowlist secret
        redirectUri: 'https://sprouter.test/auth/mastodon/callback',
    );

    expect($result['access_token'])->toBe('user-token-abc')
        ->and($result['handle'])->toBe('@testuser@fosstodon.org');
});
