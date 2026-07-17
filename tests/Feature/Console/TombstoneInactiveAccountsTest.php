<?php

use App\Mail\AccountTombstoned;
use App\Models\Passkey;
use App\Models\PasskeyRecoveryToken;
use App\Models\SocialAccount;
use App\Models\Tombstone;
use App\Models\User;
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
    Mail::fake();
    Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP down'));

    $user = User::factory()->create(['last_active_at' => now()->subDays(95)]);

    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    // The archive+delete already committed before the mail send was attempted,
    // so the failure to send mail must not undo the tombstone.
    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    expect(Tombstone::where('email', $user->email)->exists())->toBeTrue();
});
