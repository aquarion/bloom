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

test('a failure for one user is logged and does not block the rest of the batch', function () {
    Mail::fake();
    Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP down'));

    $user = User::factory()->create(['last_active_at' => now()->subDays(95)]);

    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    // Transaction rolled back for this user — nothing partially committed.
    $this->assertDatabaseHas('users', ['id' => $user->id]);
    expect(Tombstone::where('email', $user->email)->exists())->toBeFalse();
});
