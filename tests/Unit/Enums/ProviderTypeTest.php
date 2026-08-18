<?php

use App\Contracts\ProviderFeedSource;
use App\Enums\ProviderType;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Mastodon\MastodonFeedService;
use Tests\TestCase;

uses(TestCase::class);

it('has the expected backing values', function () {
    expect(ProviderType::Mastodon->value)->toBe('mastodon');
    expect(ProviderType::Bluesky->value)->toBe('bluesky');
});

it('resolves mastodon to the MastodonFeedService strategy', function () {
    expect(ProviderType::Mastodon->strategy())
        ->toBeInstanceOf(MastodonFeedService::class)
        ->toBeInstanceOf(ProviderFeedSource::class);
});

it('resolves bluesky to the BlueskyFeedService strategy', function () {
    expect(ProviderType::Bluesky->strategy())
        ->toBeInstanceOf(BlueskyFeedService::class)
        ->toBeInstanceOf(ProviderFeedSource::class);
});
