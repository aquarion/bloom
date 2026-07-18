<?php

use App\Mail\AccountTombstoned;
use App\Models\Passkey;
use App\Models\PasskeyRecoveryToken;
use App\Models\SocialAccount;
use App\Models\Tombstone;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

test('archives passkeys and social accounts, cancels subscription, emails, and deletes the user', function () {
    Mail::fake();

    $user = User::factory()->create([
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
        'last_active_at' => now()->subDays(91),
    ]);
    $passkey = Passkey::factory()->for($user)->create([
        'name' => 'YubiKey',
        'credential_id' => 'cred-abc',
        'public_key' => 'pubkey-abc',
        'sign_count' => 3,
        'transports' => ['usb'],
    ]);
    $socialAccount = SocialAccount::factory()->for($user)->create([
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'access_token' => 'super-secret-token',
    ]);
    PasskeyRecoveryToken::createForUser($user, 'leftover-token');

    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    $tombstone = Tombstone::where('email', 'ada@example.com')->first();
    expect($tombstone)->not->toBeNull();
    expect($tombstone->name)->toBe('Ada Lovelace');
    expect($tombstone->schema_version)->toBe(Tombstone::CURRENT_SCHEMA_VERSION);
    expect($tombstone->original_user_id)->toBe($user->id);
    expect($tombstone->archived_passkeys)->toBe([[
        'credential_id' => 'cred-abc',
        'public_key' => 'pubkey-abc',
        'sign_count' => 3,
        'transports' => ['usb'],
        'name' => 'YubiKey',
    ]]);
    expect($tombstone->archived_social_accounts)->toBe([$socialAccount->toArchive()]);

    foreach ($tombstone->archived_social_accounts as $archived) {
        expect($archived)->not->toHaveKey('access_token');
    }

    Mail::assertSent(AccountTombstoned::class, fn ($mail) => $mail->name === 'Ada Lovelace');

    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    $this->assertDatabaseMissing('passkeys', ['id' => $passkey->id]);
    $this->assertDatabaseMissing('social_accounts', ['id' => $socialAccount->id]);
    $this->assertDatabaseMissing('passkey_recovery_tokens', ['user_id' => $user->id]);
});

test('does not touch a user who is still within the active window', function () {
    Mail::fake();

    $user = User::factory()->create(['last_active_at' => now()->subDays(50)]);

    $this->artisan('accounts:tombstone-inactive');

    $this->assertDatabaseHas('users', ['id' => $user->id]);
    Mail::assertNothingSent();
});

test('tombstones exactly at the 90-day boundary', function () {
    Mail::fake();

    $user = User::factory()->create(['last_active_at' => now()->subDays(90)]);

    $this->artisan('accounts:tombstone-inactive');

    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    expect(Tombstone::where('email', $user->email)->exists())->toBeTrue();
});

test('tombstones multiple eligible inactive users in a single run', function () {
    Mail::fake();

    $userOne = User::factory()->create([
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
        'last_active_at' => now()->subDays(91),
    ]);
    $userTwo = User::factory()->create([
        'name' => 'Grace Hopper',
        'email' => 'grace@example.com',
        'last_active_at' => now()->subDays(120),
    ]);

    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    $this->assertDatabaseMissing('users', ['id' => $userOne->id]);
    $this->assertDatabaseMissing('users', ['id' => $userTwo->id]);

    expect(Tombstone::where('email', 'ada@example.com')->exists())->toBeTrue();
    expect(Tombstone::where('email', 'grace@example.com')->exists())->toBeTrue();

    Mail::assertSent(AccountTombstoned::class, fn ($mail) => $mail->name === 'Ada Lovelace');
    Mail::assertSent(AccountTombstoned::class, fn ($mail) => $mail->name === 'Grace Hopper');
    Mail::assertSent(AccountTombstoned::class, 2);
});

test('a mail failure for one user is logged but the already-committed archive is not rolled back', function () {
    Log::spy();
    Mail::fake();
    Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP down'));

    $user = User::factory()->create(['last_active_at' => now()->subDays(95)]);

    // A mail-only failure is not a tombstoning failure — the exit code must stay success.
    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    // The archive+delete already committed before the mail send was attempted,
    // so the failure to send mail must not undo the tombstone.
    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    expect(Tombstone::where('email', $user->email)->exists())->toBeTrue();

    // The log message must correctly attribute the failure to the notification email,
    // not to the archive/tombstone process itself.
    Log::shouldHaveReceived('error')
        ->with('Account tombstoned but notification email failed to send', Mockery::on(fn ($context) => $context['user_id'] === $user->id))
        ->once();
    Log::shouldNotHaveReceived('error', [Mockery::on(fn ($message) => $message === 'Failed to tombstone inactive account')]);
});

test('prints a success summary and exit code 0 when nothing fails', function () {
    Mail::fake();

    $user = User::factory()->create(['last_active_at' => now()->subDays(95)]);

    $this->artisan('accounts:tombstone-inactive')
        ->expectsOutputToContain('Tombstoned 1 account(s), 0 failure(s).')
        ->assertExitCode(0);

    $this->assertDatabaseMissing('users', ['id' => $user->id]);
});

test('returns a failure exit code and reports counts when an archive genuinely fails', function () {
    Mail::fake();
    Log::spy();

    // Simulate a real archive failure (not a mail failure) via a model event that throws
    // only for one specific email, so the transaction for that user rolls back.
    Tombstone::creating(function (Tombstone $tombstone) {
        if ($tombstone->email === 'boom@example.com') {
            throw new RuntimeException('simulated archive failure');
        }
    });

    $failingUser = User::factory()->create([
        'email' => 'boom@example.com',
        'last_active_at' => now()->subDays(95),
    ]);
    $okUser = User::factory()->create([
        'email' => 'fine@example.com',
        'last_active_at' => now()->subDays(95),
    ]);

    $this->artisan('accounts:tombstone-inactive')
        ->expectsOutputToContain('Tombstoned 1 account(s), 1 failure(s).')
        ->assertExitCode(1);

    // The failing user's archive transaction rolled back — user still exists, no tombstone.
    $this->assertDatabaseHas('users', ['id' => $failingUser->id]);
    expect(Tombstone::where('email', 'boom@example.com')->exists())->toBeFalse();

    // The unrelated user still succeeded.
    $this->assertDatabaseMissing('users', ['id' => $okUser->id]);
    expect(Tombstone::where('email', 'fine@example.com')->exists())->toBeTrue();

    Log::shouldHaveReceived('error')
        ->with('Failed to tombstone inactive account', Mockery::on(fn ($context) => $context['user_id'] === $failingUser->id))
        ->once();

    Tombstone::flushEventListeners();
});

test('a stale, never-resurrected tombstone for the same email is replaced rather than blocking re-tombstoning', function () {
    Mail::fake();

    Tombstone::create([
        'email' => 'returning@example.com',
        'name' => 'Old Name',
        'schema_version' => Tombstone::CURRENT_SCHEMA_VERSION,
        'archived_passkeys' => [],
        'archived_social_accounts' => [],
        'original_user_id' => 999,
        'tombstoned_at' => now()->subDays(200),
    ]);

    $user = User::factory()->create([
        'name' => 'New Name',
        'email' => 'returning@example.com',
        'last_active_at' => now()->subDays(95),
    ]);

    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    expect(Tombstone::where('email', 'returning@example.com')->count())->toBe(1);

    $tombstone = Tombstone::where('email', 'returning@example.com')->first();
    expect($tombstone->name)->toBe('New Name');
    expect($tombstone->original_user_id)->toBe($user->id);
});
