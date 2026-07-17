<?php

use App\Models\SocialAccount;
use App\Models\Tombstone;
use App\Models\TombstoneRecoveryToken;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('show renders the archived interstitial when session has a tombstone_id', function () {
    $tombstone = Tombstone::factory()->create(['name' => 'Ada Lovelace', 'email' => 'ada@example.com']);

    $this->withoutVite()
        ->withSession(['tombstone_id' => $tombstone->id])
        ->get(route('tombstone.show'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('auth/tombstone')
            ->where('name', 'Ada Lovelace')
            ->where('email', 'ada@example.com')
        );
});

test('show redirects to login when there is no tombstone_id in session', function () {
    $this->get(route('tombstone.show'))
        ->assertRedirect(route('login'));
});

test('destroy permanently deletes the tombstone and its recovery tokens', function () {
    $tombstone = Tombstone::factory()->create();
    $recoveryToken = TombstoneRecoveryToken::createForTombstone($tombstone, 'a-token');

    $this->withSession(['tombstone_id' => $tombstone->id])
        ->delete(route('tombstone.destroy'))
        ->assertRedirect(route('login'));

    $this->assertDatabaseMissing('tombstones', ['id' => $tombstone->id]);
    $this->assertDatabaseMissing('tombstone_recovery_tokens', ['id' => $recoveryToken->id]);
    $this->assertGuest();
});

test('destroy without a session tombstone_id redirects to login without deleting anything', function () {
    $tombstone = Tombstone::factory()->create();

    $this->delete(route('tombstone.destroy'))->assertRedirect(route('login'));

    $this->assertDatabaseHas('tombstones', ['id' => $tombstone->id]);
});

test('resurrect recreates the verified passkey and flags social accounts for reconnect', function () {
    $tombstone = Tombstone::factory()->create([
        'email' => 'ada@example.com',
        'name' => 'Ada Lovelace',
        'archived_passkeys' => [[
            'credential_id' => 'cred-abc',
            'public_key' => 'pubkey-abc',
            'sign_count' => 3,
            'transports' => ['usb'],
            'name' => 'YubiKey',
        ]],
        'archived_social_accounts' => [
            SocialAccount::factory()->make(['provider' => 'mastodon', 'feed_type' => 'home'])->toArchive(),
        ],
    ]);

    $this->withSession([
        'tombstone_id' => $tombstone->id,
        'tombstone_credential_id' => 'cred-abc',
    ])->post(route('tombstone.resurrect'))
        ->assertRedirect(route('feed'));

    $this->assertDatabaseMissing('tombstones', ['id' => $tombstone->id]);

    $newUser = User::where('email', 'ada@example.com')->first();
    expect($newUser)->not->toBeNull();
    $this->assertAuthenticatedAs($newUser);

    $passkey = $newUser->passkeys()->first();
    expect($passkey)->not->toBeNull();
    expect($passkey->credential_id)->toBe('cred-abc');

    $socialAccount = $newUser->socialAccounts()->first();
    expect($socialAccount)->not->toBeNull();
    expect($socialAccount->auth_failed_at)->not->toBeNull();
    expect($socialAccount->access_token)->toBeNull();
});

test('resurrect redirects gracefully when a user already exists with the tombstone email', function () {
    $tombstone = Tombstone::factory()->create([
        'email' => 'ada@example.com',
        'name' => 'Ada Lovelace',
        'archived_passkeys' => [],
        'archived_social_accounts' => [],
    ]);

    User::factory()->create(['email' => 'ada@example.com']);

    $this->withSession(['tombstone_id' => $tombstone->id])
        ->post(route('tombstone.resurrect'))
        ->assertRedirect(route('login'))
        ->assertSessionHas('status', 'account-already-exists');

    $this->assertGuest();
    $this->assertDatabaseHas('tombstones', ['id' => $tombstone->id]);
    $this->assertSame(1, User::where('email', 'ada@example.com')->count());
});

test('resurrect via the email-recovery path (no verified credential) creates a user with no passkey', function () {
    $tombstone = Tombstone::factory()->create([
        'email' => 'bob@example.com',
        'name' => 'Bob',
        'archived_passkeys' => [['credential_id' => 'cred-xyz', 'public_key' => 'k', 'sign_count' => 0, 'transports' => [], 'name' => 'Phone']],
        'archived_social_accounts' => [],
    ]);

    $this->withSession(['tombstone_id' => $tombstone->id])
        ->post(route('tombstone.resurrect'))
        ->assertRedirect(route('feed'));

    $newUser = User::where('email', 'bob@example.com')->first();
    expect($newUser->passkeys()->count())->toBe(0);
});
