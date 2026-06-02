<?php

use App\Models\User;

test('profile page is displayed', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->get(route('profile.edit'))
        ->assertOk();
});

test('profile information can be updated', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->patch(route('profile.update'), [
            'name' => 'Test User',
            'email' => 'test@example.com',
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('profile.edit'));

    $user->refresh();

    expect($user->name)->toBe('Test User');
    expect($user->email)->toBe('test@example.com');
});

test('user can delete their account', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->withSession(['passkey_confirmed_at' => time()])
        ->delete(route('profile.destroy'))
        ->assertSessionHasNoErrors()
        ->assertRedirect('/');

    $this->assertGuest();
    expect($user->fresh())->toBeNull();
});
