<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    Cache::flush();
});

it('sets auth_failed_at when the timeline returns 401', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'access_token' => 'revoked-token',
        'auth_failed_at' => null,
    ]);

    Http::fake([
        'mastodon.social/api/v1/timelines/home*' => Http::response(
            ['error' => 'The access token is invalid'], 401
        ),
    ]);

    $service = new MastodonFeedService;

    expect(fn () => $service->getHomeTimeline($account))
        ->toThrow(RequestException::class);

    expect($account->fresh()->auth_failed_at)->not->toBeNull();
});

it('does not set auth_failed_at on transient 5xx errors', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'access_token' => 'valid-token',
        'auth_failed_at' => null,
    ]);

    Http::fake([
        'mastodon.social/api/v1/timelines/home*' => Http::response(
            ['error' => 'Internal Server Error'], 503
        ),
    ]);

    $service = new MastodonFeedService;

    expect(fn () => $service->getHomeTimeline($account))
        ->toThrow(RequestException::class);

    expect($account->fresh()->auth_failed_at)->toBeNull();
});

it('clears auth_failed_at on successful timeline fetch', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'access_token' => 'valid-token',
        'auth_failed_at' => now()->subHour(),
    ]);

    Http::fake([
        'mastodon.social/api/v1/timelines/home*' => Http::response([
            ['id' => '123', 'created_at' => now()->toISOString(), 'content' => 'Hello'],
        ]),
    ]);

    $service = new MastodonFeedService;
    $service->getHomeTimeline($account);

    expect($account->fresh()->auth_failed_at)->toBeNull();
});

it('resolves mastodon chip_mentions avatar/display_name via account lookup', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.example',
        'access_token' => 'token',
    ]);

    Http::fake([
        'mastodon.example/api/v1/accounts/lookup*' => Http::response([
            'display_name' => 'Alice',
            'avatar' => 'https://mastodon.example/avatars/alice.jpg',
        ]),
    ]);

    $posts = [
        [
            'id' => 'p1',
            'chip_mentions' => [
                ['handle' => '@alice', 'display_name' => '@alice', 'avatar' => '', 'profile_url' => 'https://mastodon.example/@alice'],
            ],
        ],
    ];

    $service = new MastodonFeedService;
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved[0]['chip_mentions'][0]['display_name'])->toBe('Alice')
        ->and($resolved[0]['chip_mentions'][0]['avatar'])->toBe('https://mastodon.example/avatars/alice.jpg')
        ->and($resolved[0]['chip_mentions'][0]['handle'])->toBe('@alice');
});

it('falls back to the placeholder when the mastodon lookup fails', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.example',
        'access_token' => 'token',
    ]);

    Http::fake([
        'mastodon.example/api/v1/accounts/lookup*' => Http::response([], 404),
    ]);

    $posts = [
        [
            'id' => 'p1',
            'chip_mentions' => [
                ['handle' => '@ghost', 'display_name' => '@ghost', 'avatar' => '', 'profile_url' => 'https://mastodon.example/@ghost'],
            ],
        ],
    ];

    $service = new MastodonFeedService;
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved[0]['chip_mentions'][0]['display_name'])->toBe('@ghost')
        ->and($resolved[0]['chip_mentions'][0]['avatar'])->toBe('');
});

it('strips unsafe avatar URL schemes when resolving mastodon chip_mentions', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.example',
        'access_token' => 'token',
    ]);

    Http::fake([
        'mastodon.example/api/v1/accounts/lookup*' => Http::response([
            'display_name' => 'Mallory',
            'avatar' => 'javascript:alert(1)',
        ]),
    ]);

    $posts = [
        [
            'id' => 'p1',
            'chip_mentions' => [
                ['handle' => '@mallory', 'display_name' => '@mallory', 'avatar' => '', 'profile_url' => 'https://mastodon.example/@mallory'],
            ],
        ],
    ];

    $service = new MastodonFeedService;
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved[0]['chip_mentions'][0]['avatar'])->toBe('');
});
