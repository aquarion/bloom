<?php

use App\Models\User;

test('avatar accessor builds a gravatar url from a sha256 hash of the lowercased trimmed email', function () {
    $user = User::factory()->create(['email' => '  Test@Example.com  ']);

    $expectedHash = hash('sha256', 'test@example.com');

    expect($user->avatar)->toBe("https://www.gravatar.com/avatar/{$expectedHash}?s=128&d=404");
});

test('avatar is appended to the serialized user output', function () {
    $user = User::factory()->create(['email' => 'test@example.com']);

    $expectedHash = hash('sha256', 'test@example.com');

    expect($user->toArray())->toHaveKey('avatar', "https://www.gravatar.com/avatar/{$expectedHash}?s=128&d=404");
});
