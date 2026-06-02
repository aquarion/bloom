<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('security page is displayed', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->get(route('security.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/security')
            ->has('passkeys'),
        );
});

test('security page lists user passkeys', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->get(route('security.edit'))
        ->assertInertia(fn (Assert $page) => $page
            ->has('passkeys', 1),
        );
});
