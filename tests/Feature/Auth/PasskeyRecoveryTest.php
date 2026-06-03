<?php

use App\Mail\PasskeyRecovery;
use App\Models\PasskeyRecoveryToken;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Inertia\Testing\AssertableInertia as Assert;

test('recovery page can be rendered', function () {
    $this->withoutVite()->get(route('passkey.recover'))->assertOk();
});

test('recovery email is sent when account exists', function () {
    Mail::fake();

    $user = User::factory()->create(['email' => 'user@example.com']);

    $this->post(route('passkey.recover.store'), ['email' => 'user@example.com'])
        ->assertRedirect(route('passkey.recover.sent'));

    Mail::assertSent(PasskeyRecovery::class, fn ($mail) => $mail->hasTo('user@example.com'));

    expect(PasskeyRecoveryToken::where('user_id', $user->id)->count())->toBe(1);
});

test('recovery silently succeeds for unknown email', function () {
    Mail::fake();

    $this->post(route('passkey.recover.store'), ['email' => 'nobody@example.com'])
        ->assertRedirect(route('passkey.recover.sent'));

    Mail::assertNothingSent();
});

test('recovery invalidates previous unused tokens', function () {
    Mail::fake();

    $user = User::factory()->create();
    PasskeyRecoveryToken::create(['user_id' => $user->id, 'token' => hash('sha256', 'old-token')]);

    $this->post(route('passkey.recover.store'), ['email' => $user->email]);

    expect(PasskeyRecoveryToken::where('token', hash('sha256', 'old-token'))->exists())->toBeFalse();
    expect(PasskeyRecoveryToken::where('user_id', $user->id)->count())->toBe(1);
});

test('valid recovery token logs in user and redirects to passkey setup', function () {
    $user = User::factory()->create();
    $record = PasskeyRecoveryToken::create(['user_id' => $user->id, 'token' => hash('sha256', 'valid-token')]);

    $this->get(route('passkey.recover.setup', 'valid-token'))
        ->assertRedirect(route('passkey.setup'));

    $this->assertAuthenticatedAs($user);
    expect($record->fresh()->used_at)->not->toBeNull();
});

test('expired recovery token shows invalid page', function () {
    $user = User::factory()->create();
    $record = PasskeyRecoveryToken::create(['user_id' => $user->id, 'token' => hash('sha256', 'expired-token')]);
    $record->created_at = now()->subHours(2);
    $record->save();

    $this->withoutVite()
        ->get(route('passkey.recover.setup', 'expired-token'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('auth/recover-invalid'));

    $this->assertGuest();
});

test('used recovery token shows invalid page', function () {
    $user = User::factory()->create();
    PasskeyRecoveryToken::create([
        'user_id' => $user->id,
        'token' => hash('sha256', 'used-token'),
        'used_at' => now(),
    ]);

    $this->withoutVite()
        ->get(route('passkey.recover.setup', 'used-token'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('auth/recover-invalid'));

    $this->assertGuest();
});

test('unknown recovery token shows invalid page', function () {
    $this->withoutVite()
        ->get(route('passkey.recover.setup', 'no-such-token'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('auth/recover-invalid'));
});

test('recovery store rejects missing email', function () {
    $this->post(route('passkey.recover.store'), [])
        ->assertSessionHasErrors('email');
});

test('recovery store rejects invalid email format', function () {
    $this->post(route('passkey.recover.store'), ['email' => 'not-an-email'])
        ->assertSessionHasErrors('email');
});

test('recovery lookup is case-insensitive', function () {
    Mail::fake();

    $user = User::factory()->create(['email' => 'user@example.com']);

    $this->post(route('passkey.recover.store'), ['email' => 'User@Example.COM'])
        ->assertRedirect(route('passkey.recover.sent'));

    Mail::assertSent(PasskeyRecovery::class, fn ($mail) => $mail->hasTo('user@example.com'));
});
