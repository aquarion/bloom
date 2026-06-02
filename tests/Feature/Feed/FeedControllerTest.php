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
