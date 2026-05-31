<?php

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\User;

test('inertia returns 409 when version header is stale', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('dashboard'), [
        'X-Inertia' => 'true',
        'X-Inertia-Version' => 'stale-version-that-does-not-match',
    ])->assertStatus(409);
});

test('version hash changes when app version config changes', function () {
    $middleware = app(HandleInertiaRequests::class);

    config(['version.version' => '1.0.0']);
    $versionA = $middleware->version(request());

    config(['version.version' => '2.0.0']);
    $versionB = $middleware->version(request());

    expect($versionA)->not->toBe($versionB);
});

test('inertia does not return 409 when version header matches', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $middleware = app(HandleInertiaRequests::class);
    $currentVersion = $middleware->version(request());

    $this->get(route('dashboard'), [
        'X-Inertia' => 'true',
        'X-Inertia-Version' => $currentVersion,
    ])->assertOk();
});
