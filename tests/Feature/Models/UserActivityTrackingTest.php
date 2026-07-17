<?php

use App\Models\User;
use Carbon\CarbonInterface;

test('last_active_at and inactivity_warning_sent_at are datetime casts and mass-assignable', function () {
    $user = User::factory()->create([
        'last_active_at' => now()->subDays(5),
        'inactivity_warning_sent_at' => now()->subDay(),
    ]);

    expect($user->last_active_at)->toBeInstanceOf(CarbonInterface::class);
    expect($user->inactivity_warning_sent_at)->toBeInstanceOf(CarbonInterface::class);

    $user->update(['last_active_at' => now(), 'inactivity_warning_sent_at' => null]);

    expect($user->fresh()->inactivity_warning_sent_at)->toBeNull();
});

test('cancelSubscription and isSubscribed are no-op billing placeholders', function () {
    $user = User::factory()->create();

    expect($user->isSubscribed())->toBeFalse();
    expect($user->cancelSubscription())->toBeNull();
});
