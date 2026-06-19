<?php

use App\Models\User;

test('user can enable beta tester', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->patch(route('beta-tester.update'), ['beta_tester' => true])
        ->assertRedirect(route('profile.edit'));

    expect($user->fresh()->hasRole('beta_tester'))->toBeTrue();
});

test('user can disable beta tester', function () {
    $user = User::factory()->withPasskey()->create(['roles' => ['beta_tester']]);

    $this->actingAs($user)
        ->patch(route('beta-tester.update'), ['beta_tester' => false])
        ->assertRedirect(route('profile.edit'));

    expect($user->fresh()->hasRole('beta_tester'))->toBeFalse();
});

test('beta tester toggle requires authentication', function () {
    $this->patch(route('beta-tester.update'), ['beta_tester' => true])
        ->assertRedirect(route('login'));
});
