<?php

use App\Models\User;
use Laravel\Fortify\Features;

beforeEach(function () {
    $this->skipUnlessFortifyHas(Features::registration());
});

test('registration screen can be rendered', function () {
    $response = $this->get(route('register'));

    $response->assertOk();
});

test('new users can register', function () {
    $response = $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'test@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('passkey.setup'));
});

test('passkey setup page is accessible to authenticated users', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->withoutVite()->get(route('passkey.setup'));

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page->component('auth/passkey-setup'));
});

test('skip passkey setup redirects to dashboard', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('passkey.setup.skip'));

    $response->assertRedirect(route('dashboard'));
});
