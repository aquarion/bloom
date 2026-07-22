<?php

use App\Models\User;
use App\Services\Feed\FeedAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('renders the feed page for authenticated users', function () {
    $user = User::factory()->withPasskey()->create();

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetch')->once()->andReturn([
        'posts' => [],
        'next_cursor' => null,
    ]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));

    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->has('initialPosts')
        ->has('initialCursor')
    );
});

it('returns json for xhr requests', function () {
    $user = User::factory()->withPasskey()->create();

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetch')->once()->andReturn([
        'posts' => [],
        'next_cursor' => null,
    ]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $response = $this->actingAs($user)
        ->getJson(route('feed'));

    $response->assertOk()->assertJsonStructure(['posts', 'next_cursor']);
});

it('redirects guests to login', function () {
    $this->get(route('feed'))->assertRedirect(route('login'));
});

it('passes the persisted cw author whitelist to the feed page', function () {
    $user = User::factory()->withPasskey()->create([
        'feed_preferences' => ['cw_author_whitelist' => ['@alice@mastodon.social']],
    ]);

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetch')->once()->andReturn([
        'posts' => [],
        'next_cursor' => null,
    ]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));

    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->where('cwAuthorWhitelist', ['@alice@mastodon.social'])
    );
});

it('enables mentions for users without the beta tester role', function () {
    $user = User::factory()->withPasskey()->create();

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetch')
        ->once()
        ->with($user, 20, null, true)
        ->andReturn([
            'posts' => [],
            'next_cursor' => null,
        ]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $this->actingAs($user)->withoutVite()->get(route('feed'))->assertOk();
});
