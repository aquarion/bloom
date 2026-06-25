<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyAuthService;
use App\Services\Bluesky\BlueskyFeedService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    Cache::flush();
});

it('returns the timeline on a successful request', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'valid-token',
        'token_secret' => 'refresh-token',
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
        'instance_url' => 'https://bsky.social',
        'access_token' => 'expired-token',
        'token_secret' => 'valid-refresh-token',
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

it('enriches post authors with banner from getProfiles', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'valid-token',
        'token_secret' => 'refresh-token',
    ]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response([
            'feed' => [[
                'post' => [
                    'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
                    'record' => [],
                    'author' => ['did' => 'did:plc:abc', 'handle' => 'user.bsky.social'],
                ],
            ]],
            'cursor' => null,
        ]),
        'bsky.social/xrpc/app.bsky.actor.getProfiles*' => Http::response([
            'profiles' => [['did' => 'did:plc:abc', 'banner' => 'https://cdn.bsky.app/banner.jpg']],
        ]),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $result = $service->getHomeTimeline($account);

    expect($result['posts'][0]['post']['author']['banner'])->toBe('https://cdn.bsky.app/banner.jpg');
});

it('caches profile banners for 24 hours and avoids re-fetching', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'valid-token',
        'token_secret' => 'refresh-token',
    ]);

    $feedResponse = [
        'feed' => [[
            'post' => [
                'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
                'record' => [],
                'author' => ['did' => 'did:plc:abc', 'handle' => 'user.bsky.social'],
            ],
        ]],
        'cursor' => null,
    ];

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response($feedResponse),
        'bsky.social/xrpc/app.bsky.actor.getProfiles*' => Http::response([
            'profiles' => [['did' => 'did:plc:abc', 'banner' => 'https://cdn.bsky.app/banner.jpg']],
        ]),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $service->getHomeTimeline($account);
    $service->getHomeTimeline($account);

    Http::assertSentCount(2); // 1 timeline + 1 getProfiles on first call; both cached on second
});

it('skips profile fetch for authors that already have a banner', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'valid-token',
        'token_secret' => 'refresh-token',
    ]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response([
            'feed' => [[
                'post' => [
                    'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
                    'record' => [],
                    'author' => [
                        'did' => 'did:plc:abc',
                        'handle' => 'user.bsky.social',
                        'banner' => 'https://cdn.bsky.app/existing-banner.jpg',
                    ],
                ],
            ]],
            'cursor' => null,
        ]),
        'bsky.social/xrpc/app.bsky.actor.getProfiles*' => Http::response(['profiles' => []]),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $result = $service->getHomeTimeline($account);

    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'getProfiles'));
    expect($result['posts'][0]['post']['author']['banner'])->toBe('https://cdn.bsky.app/existing-banner.jpg');
});

it('handles getProfiles failure gracefully and returns posts without banners', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'valid-token',
        'token_secret' => 'refresh-token',
    ]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response([
            'feed' => [[
                'post' => [
                    'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
                    'record' => [],
                    'author' => ['did' => 'did:plc:abc', 'handle' => 'user.bsky.social'],
                ],
            ]],
            'cursor' => null,
        ]),
        'bsky.social/xrpc/app.bsky.actor.getProfiles*' => Http::response(['error' => 'ServerError'], 500),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $result = $service->getHomeTimeline($account);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['post']['author'])->not->toHaveKey('banner');
});

it('does not retry on non-expiry errors', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'some-token',
        'token_secret' => 'refresh-token',
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

it('sets auth_failed_at when the refresh token is rejected', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'expired-token',
        'token_secret' => 'revoked-refresh-token',
        'auth_failed_at' => null,
    ]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response(
            ['error' => 'ExpiredToken', 'message' => 'Token has expired'], 400
        ),
        'bsky.social/xrpc/com.atproto.server.refreshSession' => Http::response(
            ['error' => 'ExpiredToken', 'message' => 'Token has expired'], 400
        ),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);

    expect(fn () => $service->getHomeTimeline($account))
        ->toThrow(RequestException::class);

    expect($account->fresh()->auth_failed_at)->not->toBeNull();
});

it('clears auth_failed_at on successful token refresh', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'expired-token',
        'token_secret' => 'valid-refresh-token',
        'auth_failed_at' => now()->subHour(),
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
    $service->getHomeTimeline($account);

    expect($account->fresh()->auth_failed_at)->toBeNull();
});

it('resolves chip_mentions placeholder profile_url dids into real handle/avatar/profile_url', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'token',
    ]);

    Http::fake([
        '*app.bsky.actor.getProfiles*' => Http::response([
            'profiles' => [
                ['did' => 'did:plc:alice', 'handle' => 'alice.bsky.social', 'displayName' => 'Alice', 'avatar' => 'https://example.com/alice.jpg'],
            ],
        ]),
    ]);

    $posts = [
        [
            'id' => 'p1',
            'chip_mentions' => [
                ['handle' => '', 'display_name' => '', 'avatar' => '', 'profile_url' => 'did:plc:alice'],
            ],
        ],
    ];

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved[0]['chip_mentions'][0]['handle'])->toBe('@alice.bsky.social')
        ->and($resolved[0]['chip_mentions'][0]['display_name'])->toBe('Alice')
        ->and($resolved[0]['chip_mentions'][0]['avatar'])->toBe('https://example.com/alice.jpg')
        ->and($resolved[0]['chip_mentions'][0]['profile_url'])->toBe('https://bsky.app/profile/alice.bsky.social');
});

it('leaves chip_mentions with no placeholder dids untouched', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'token',
    ]);

    Http::fake();

    $posts = [['id' => 'p1', 'chip_mentions' => []]];

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved)->toBe($posts);
    Http::assertNothingSent();
});
