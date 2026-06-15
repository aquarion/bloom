<?php

use App\Models\SocialAccount;
use App\Models\User;

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users with accounts are redirected to feed', function () {
    $user = User::factory()->withPasskey()->create();
    SocialAccount::factory()->create(['user_id' => $user->id]);
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('feed'));
});

test('authenticated users without accounts are redirected to connections', function () {
    $user = User::factory()->withPasskey()->create();
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('connections.edit'));
});
