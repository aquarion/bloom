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

    // initialPosts/initialCursor are deferred so the page shell renders
    // without waiting on the (potentially slow) provider fetch — they're
    // absent from the initial payload and only resolve on the follow-up
    // reload Inertia issues for deferred props.
    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->missing('initialPosts')
        ->missing('initialCursor')
        ->loadDeferredProps(fn ($page) => $page
            ->has('initialPosts')
            ->has('initialCursor')
        )
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

    // cwAuthorWhitelist isn't deferred, so it's resolved on the initial
    // load — the aggregator mock is never invoked in this test.
    $mockAggregator = Mockery::mock(FeedAggregator::class);
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

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));
    $response->assertOk();
    $response->assertInertia(fn ($page) => $page->loadDeferredProps(fn ($page) => $page));
});
