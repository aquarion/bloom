<?php

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    // resolveFeedGenerator() caches by feed URI, and other test files resolve the
    // same example URIs — flush so those don't leak into these assertions.
    Cache::flush();
});

test('resolves and stores names for feeds missing them', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);
    $feedAccount = SocialAccount::factory()
        ->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/whats-hot')
        ->create(['user_id' => $user->id]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getFeedGenerator*' => Http::response([
            'view' => [
                'uri' => 'at://did:plc:test/app.bsky.feed.generator/whats-hot',
                'displayName' => "What's Hot",
                'creator' => ['handle' => 'bsky.app'],
            ],
            'isOnline' => true,
            'isValid' => true,
        ]),
    ]);

    $this->artisan('bluesky:backfill-feed-names')->assertExitCode(0);

    expect($feedAccount->fresh()->feed_settings['feed_name'])->toBe("What's Hot");
});

test('skips feeds that already have a name', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);
    SocialAccount::factory()
        ->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/whats-hot', 'Already Named')
        ->create(['user_id' => $user->id]);

    Http::fake();

    $this->artisan('bluesky:backfill-feed-names')->assertExitCode(0);

    Http::assertNothingSent();
});

test('skips feeds whose generator cannot be resolved', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);
    $feedAccount = SocialAccount::factory()
        ->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/gone')
        ->create(['user_id' => $user->id]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getFeedGenerator*' => Http::response(['error' => 'NotFound'], 400),
    ]);

    $this->artisan('bluesky:backfill-feed-names')->assertExitCode(0);

    expect($feedAccount->fresh()->feed_settings['feed_name'] ?? null)->toBeNull();
});
