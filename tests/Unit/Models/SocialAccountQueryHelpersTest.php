<?php

use App\Enums\ProviderType;
use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('existsFor finds a matching account by provider, instance, and handle', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->for($user)->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    expect(SocialAccount::existsFor(
        $user,
        ProviderType::Mastodon,
        instanceUrl: 'https://fosstodon.org',
        handle: '@alice@fosstodon.org',
    ))->toBeTrue();
});

it('existsFor returns false when no account matches', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->for($user)->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    expect(SocialAccount::existsFor(
        $user,
        ProviderType::Mastodon,
        instanceUrl: 'https://fosstodon.org',
        handle: '@bob@fosstodon.org',
    ))->toBeFalse();
});

it('existsFor filters by feed_type when given', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->for($user)->publicMastodon('https://social.example')->create();

    expect(SocialAccount::existsFor(
        $user,
        ProviderType::Mastodon,
        instanceUrl: 'https://social.example',
        feedType: 'public_mastodon',
    ))->toBeTrue();

    expect(SocialAccount::existsFor(
        $user,
        ProviderType::Mastodon,
        instanceUrl: 'https://social.example',
        feedType: 'home',
    ))->toBeFalse();
});

it('existsFor scopes to the given user only', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    SocialAccount::factory()->for($owner)->create([
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@alice.bsky.social',
    ]);

    expect(SocialAccount::existsFor(
        $other,
        ProviderType::Bluesky,
        instanceUrl: 'https://bsky.social',
        handle: '@alice.bsky.social',
    ))->toBeFalse();
});

it('existsWithFeedUri finds a matching bluesky_feed account', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->for($user)->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/whats-hot')->create();

    expect(SocialAccount::existsWithFeedUri($user, 'at://did:plc:test/app.bsky.feed.generator/whats-hot'))->toBeTrue();
    expect(SocialAccount::existsWithFeedUri($user, 'at://did:plc:test/app.bsky.feed.generator/other'))->toBeFalse();
});
