<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Feed\FeedAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('returns posts for a single account', function () {
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->for($user)->create();

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetchAccount')
        ->once()
        ->with(Mockery::on(fn ($u) => $u->is($user)), Mockery::on(fn ($a) => $a->is($account)), null, true)
        ->andReturn(['posts' => [], 'next_cursor' => 'next-cursor']);
    $mockAggregator->shouldReceive('applyMuteWords')->once()->with([], [])->andReturn([]);
    $mockAggregator->shouldReceive('applyCwWhitelist')->once()->with([], [])->andReturn([]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $this->actingAs($user)
        ->getJson(route('feed.accounts.show', $account))
        ->assertOk()
        ->assertJson(['posts' => [], 'next_cursor' => 'next-cursor']);
});

it('forwards the cursor query param', function () {
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->for($user)->create();

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetchAccount')
        ->once()
        ->with(Mockery::any(), Mockery::any(), 'abc123', true)
        ->andReturn(['posts' => [], 'next_cursor' => null]);
    $mockAggregator->shouldReceive('applyMuteWords')->andReturnUsing(fn ($posts) => $posts);
    $mockAggregator->shouldReceive('applyCwWhitelist')->andReturnUsing(fn ($posts) => $posts);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $this->actingAs($user)
        ->getJson(route('feed.accounts.show', $account).'?cursor=abc123')
        ->assertOk();
});

it('applies mute words and cw whitelist to the account posts', function () {
    $user = User::factory()->withPasskey()->create([
        'feed_preferences' => [
            'mute_words' => ['politics'],
            'cw_label_whitelist' => ['nudity'],
        ],
    ]);
    $account = SocialAccount::factory()->for($user)->create();

    $post = ['id' => '1', 'body' => 'hello'];

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetchAccount')->once()->andReturn(['posts' => [$post], 'next_cursor' => null]);
    $mockAggregator->shouldReceive('applyMuteWords')->once()->with([$post], ['politics'])->andReturn([$post]);
    $mockAggregator->shouldReceive('applyCwWhitelist')->once()->with([$post], ['nudity'])->andReturn([$post]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $this->actingAs($user)
        ->getJson(route('feed.accounts.show', $account))
        ->assertOk()
        ->assertJson(['posts' => [$post]]);
});

it('returns 403 when the account belongs to another user', function () {
    $user = User::factory()->withPasskey()->create();
    $otherAccount = SocialAccount::factory()->create();

    $this->actingAs($user)
        ->getJson(route('feed.accounts.show', $otherAccount))
        ->assertForbidden();
});

it('redirects guests to login', function () {
    $account = SocialAccount::factory()->create();

    $this->get(route('feed.accounts.show', $account))->assertRedirect(route('login'));
});
