<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyAuthService;
use App\Services\Bluesky\BlueskyFeedService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

it('returns the timeline on a successful request', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'valid-token', // pragma: allowlist secret
        'token_secret' => 'refresh-token', // pragma: allowlist secret
    ]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response([
            'feed' => [['post' => ['uri' => 'at://did/app.bsky.feed.post/abc', 'record' => []]]],
            'cursor' => 'next-cursor',
        ]),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $result = $service->getHomeTimeline($account);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['cursor'])->toBe('next-cursor');
});

it('refreshes the token and retries when the access token is expired', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'expired-token', // pragma: allowlist secret
        'token_secret' => 'valid-refresh-token', // pragma: allowlist secret
    ]);

    Http::fake([
        'bsky.social/xrpc/com.atproto.server.refreshSession' => Http::response([
            'accessJwt' => 'new-access-token',
            'refreshJwt' => 'new-refresh-token',
        ]),
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::sequence()
            ->push(['error' => 'ExpiredToken', 'message' => 'Token has expired'], 400)
            ->push(['feed' => [['post' => ['uri' => 'at://did/app.bsky.feed.post/abc', 'record' => []]]], 'cursor' => null]),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $result = $service->getHomeTimeline($account);

    expect($result['posts'])->toHaveCount(1);

    $account->refresh();
    expect($account->access_token)->toBe('new-access-token')
        ->and($account->token_secret)->toBe('new-refresh-token');
});

it('does not retry on non-expiry errors', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'some-token', // pragma: allowlist secret
        'token_secret' => 'refresh-token', // pragma: allowlist secret
    ]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response(
            ['error' => 'Unauthorized', 'message' => 'Bad auth'],
            401
        ),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);

    expect(fn () => $service->getHomeTimeline($account))
        ->toThrow(RequestException::class);
});
