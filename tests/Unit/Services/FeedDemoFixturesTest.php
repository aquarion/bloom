<?php

use App\Services\Feed\FeedDemoFixtures;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

it('fakes the mastodon home timeline with fixture posts', function () {
    app(FeedDemoFixtures::class)->register();

    $response = Http::withToken(FeedDemoFixtures::MASTODON_ACCESS_TOKEN)
        ->get(FeedDemoFixtures::MASTODON_INSTANCE.'/api/v1/timelines/home', ['limit' => 20]);

    expect($response->successful())->toBeTrue();
    expect($response->json())->toBeArray()->not->toBeEmpty();
    expect($response->json()[0])->toHaveKeys(['id', 'account', 'content', 'created_at', 'url']);
});

it('resolves a fixture mastodon reply parent by id', function () {
    app(FeedDemoFixtures::class)->register();

    $response = Http::withToken(FeedDemoFixtures::MASTODON_ACCESS_TOKEN)
        ->get(FeedDemoFixtures::MASTODON_INSTANCE.'/api/v1/statuses/9000000000');

    expect($response->successful())->toBeTrue();
    expect($response->json('id'))->toBe('9000000000');
});

it('returns 404 for an unknown mastodon status id', function () {
    app(FeedDemoFixtures::class)->register();

    $response = Http::withToken(FeedDemoFixtures::MASTODON_ACCESS_TOKEN)
        ->get(FeedDemoFixtures::MASTODON_INSTANCE.'/api/v1/statuses/does-not-exist');

    expect($response->status())->toBe(404);
});

it('returns an empty context so demo posts skip thread detection', function () {
    app(FeedDemoFixtures::class)->register();

    $response = Http::withToken(FeedDemoFixtures::MASTODON_ACCESS_TOKEN)
        ->get(FeedDemoFixtures::MASTODON_INSTANCE.'/api/v1/statuses/9000000001/context');

    expect($response->json())->toBe(['ancestors' => [], 'descendants' => []]);
});

it('fakes the bluesky home timeline with fixture posts', function () {
    app(FeedDemoFixtures::class)->register();

    $response = Http::withToken(FeedDemoFixtures::BLUESKY_ACCESS_TOKEN)
        ->get(FeedDemoFixtures::BLUESKY_PDS.'/xrpc/app.bsky.feed.getTimeline', ['limit' => 20]);

    expect($response->successful())->toBeTrue();
    expect($response->json('feed'))->toBeArray()->not->toBeEmpty();
    expect($response->json('feed.0.post'))->toHaveKeys(['uri', 'author', 'record']);
});
