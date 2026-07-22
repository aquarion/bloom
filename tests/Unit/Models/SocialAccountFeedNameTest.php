<?php

use App\Models\SocialAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

test('feed_name is the instance host for a public mastodon timeline', function () {
    $account = SocialAccount::factory()->publicMastodon('https://mastodon.social')->create();

    expect($account->feed_name)->toBe('mastodon.social');
});

test('feed_name humanizes the feed uri slug for a bluesky algorithmic feed', function () {
    $account = SocialAccount::factory()
        ->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/whats-hot')
        ->create();

    expect($account->feed_name)->toBe('Whats Hot');
});

test('feed_name prefers the stored real name over the humanized slug guess', function () {
    $account = SocialAccount::factory()
        ->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/whats-hot', "What's Hot")
        ->create();

    expect($account->feed_name)->toBe("What's Hot");
});

test('feed_name is null for a home account', function () {
    $account = SocialAccount::factory()->create(['feed_type' => 'home']);

    expect($account->feed_name)->toBeNull();
});

test('feed_name is null when a bluesky feed has no feed_uri', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'bluesky',
        'feed_type' => 'bluesky_feed',
        'feed_settings' => [],
    ]);

    expect($account->feed_name)->toBeNull();
});

test('feed_name is appended to the serialized social account output', function () {
    $account = SocialAccount::factory()->publicMastodon('https://mastodon.social')->create();

    expect($account->toArray())->toHaveKey('feed_name', 'mastodon.social');
});
