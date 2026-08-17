<?php

use App\Models\User;
use Database\Seeders\DatabaseSeeder;

it('seeds the default test user without demo feed accounts by default', function () {
    config(['feed.demo_mode' => false]);

    $this->seed(DatabaseSeeder::class);

    $user = User::where('email', 'test@example.com')->firstOrFail();

    expect($user->socialAccounts()->count())->toBe(0);
});

it('seeds demo mastodon and bluesky accounts when feed.demo_mode is enabled', function () {
    config(['feed.demo_mode' => true]);

    $this->seed(DatabaseSeeder::class);

    $user = User::where('email', 'test@example.com')->firstOrFail();
    $providers = $user->socialAccounts()->pluck('provider')->map(fn ($p) => $p->value)->sort()->values();

    expect($providers->all())->toBe(['bluesky', 'mastodon']);
});
