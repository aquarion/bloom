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
