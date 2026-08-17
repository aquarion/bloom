<?php

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('renders the feed page for authenticated users', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));

    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->has('accounts')
    );
});

it('passes the user\'s account ids so the frontend can fetch each one directly', function () {
    $user = User::factory()->withPasskey()->create();
    $accounts = SocialAccount::factory()->for($user)->count(2)->create();

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));

    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->where('accounts', fn ($value) => collect($value)->pluck('id')->sort()->values()->all()
            === $accounts->pluck('id')->sort()->values()->all())
    );
});

it('redirects guests to login', function () {
    $this->get(route('feed'))->assertRedirect(route('login'));
});

it('passes the persisted cw author whitelist to the feed page', function () {
    $user = User::factory()->withPasskey()->create([
        'feed_preferences' => ['cw_author_whitelist' => ['@alice@mastodon.social']],
    ]);

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));

    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->where('cwAuthorWhitelist', ['@alice@mastodon.social'])
    );
});

it('passes the persisted reduce_motion preference to the feed page', function () {
    $user = User::factory()->withPasskey()->create([
        'feed_preferences' => ['reduce_motion' => true],
    ]);

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));

    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->where('reduceMotion', true)
    );
});

it('defaults reduceMotion to false on the feed page', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->withoutVite()->get(route('feed'));

    $response->assertInertia(fn ($page) => $page->component('feed', false)
        ->where('reduceMotion', false)
    );
});
