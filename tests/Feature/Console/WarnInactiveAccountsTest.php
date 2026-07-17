<?php

use App\Mail\InactivityWarning;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

test('sends a warning to a user inside the warning window and stamps inactivity_warning_sent_at', function () {
    Mail::fake();

    $user = User::factory()->create([
        'last_active_at' => now()->subDays(85),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive')->assertExitCode(0);

    Mail::assertSent(InactivityWarning::class, fn ($mail) => $mail->hasTo($user->email));
    expect($user->fresh()->inactivity_warning_sent_at)->not->toBeNull();
});

test('does not resend once inactivity_warning_sent_at is already set', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => now()->subDays(85),
        'inactivity_warning_sent_at' => now()->subDay(),
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});

test('does not warn a user who is still within the active window', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => now()->subDays(10),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});

test('does not warn a user already past the tombstone threshold', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => now()->subDays(95),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});

test('warns exactly at the 83-day boundary', function () {
    Mail::fake();

    $user = User::factory()->create([
        'last_active_at' => now()->subDays(83),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertSent(InactivityWarning::class, fn ($mail) => $mail->hasTo($user->email));
});

test('does not warn a user with no last_active_at at all', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => null,
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});
