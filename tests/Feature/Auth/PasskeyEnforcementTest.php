<?php

use App\Models\User;

test('user without passkeys is redirected to passkey setup when accessing dashboard', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertRedirect(route('passkey.setup'));
});

test('user with passkeys can access dashboard', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertOk();
});

test('user without passkeys can access passkey setup', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->withoutVite()
        ->get(route('passkey.setup'))
        ->assertOk();
});

test('delete without passkey confirmation is rejected', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->delete(route('profile.destroy'))
        ->assertRedirect();

    expect($user->fresh())->not->toBeNull();
});

test('delete with expired passkey confirmation is rejected', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->withSession(['passkey_confirmed_at' => time() - 600])
        ->delete(route('profile.destroy'))
        ->assertRedirect();

    expect($user->fresh())->not->toBeNull();
});
