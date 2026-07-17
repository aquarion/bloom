<?php

use App\Models\SocialAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

test('toArchive returns metadata only, no tokens', function () {
    $account = SocialAccount::factory()->make([
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@nick@fosstodon.org',
        'access_token' => 'super-secret-token',
        'token_secret' => 'super-secret-secret',
    ]);

    $archive = $account->toArchive();

    expect($archive)->toBe([
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@nick@fosstodon.org',
    ]);
    expect($archive)->not->toHaveKey('access_token');
    expect($archive)->not->toHaveKey('token_secret');
});

test('rehydrate builds fillable attributes flagged for reconnect, with no token', function () {
    $archived = [
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'handle' => '@nick.bsky.social',
    ];

    $attributes = SocialAccount::rehydrate($archived, schemaVersion: 1);

    expect($attributes['provider'])->toBe('bluesky');
    expect($attributes['feed_type'])->toBe('home');
    expect($attributes['instance_url'])->toBe('https://bsky.social');
    expect($attributes['handle'])->toBe('@nick.bsky.social');
    expect($attributes)->not->toHaveKey('access_token');
    expect($attributes['auth_failed_at'])->not->toBeNull();
});

test('rehydrate throws on an unrecognised schema version rather than guessing', function () {
    SocialAccount::rehydrate(['provider' => 'mastodon'], schemaVersion: 999);
})->throws(RuntimeException::class);
