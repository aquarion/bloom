<?php

use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Support\Facades\Http;

it('registers a dynamic client and returns an authorize url', function () {
    Http::fake([
        'mastodon.example/api/v1/apps' => Http::response([
            'client_id' => 'fake-client-id',
            'client_secret' => 'fake-client-secret',
        ]),
    ]);

    $service = new MastodonOAuthService;
    $url = $service->getAuthorizeUrl('https://mastodon.example', 'https://bloom.test/auth/mastodon/callback');

    expect($url)->toContain('mastodon.example/oauth/authorize')
        ->and($url)->toContain('fake-client-id')
        ->and($url)->toContain('code');
});

it('exchanges a code for an access token', function () {
    Http::fake([
        'mastodon.example/oauth/token' => Http::response([
            'access_token' => 'user-token-abc',
        ]),
        'mastodon.example/api/v1/accounts/verify_credentials' => Http::response([
            'acct' => 'testuser',
        ]),
    ]);

    $service = new MastodonOAuthService;
    $result = $service->exchangeCode(
        instance: 'https://mastodon.example',
        code: 'auth-code',
        clientId: 'fake-client-id',
        clientSecret: 'fake-client-secret',
        redirectUri: 'https://bloom.test/auth/mastodon/callback',
    );

    expect($result['access_token'])->toBe('user-token-abc')
        ->and($result['handle'])->toBe('@testuser@mastodon.example');
});
