<?php

// tests/Feature/Settings/PasskeySettingsTest.php

use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Uid\Uuid;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\TrustPath\EmptyTrustPath;

test('registerOptions returns a challenge and stores it in session', function () {
    $user = User::factory()->create();

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Test', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('generateRegistrationOptions')
        ->once()
        ->with(Mockery::type(User::class))
        ->andReturn($options);

    $response = $this->actingAs($user)->getJson(route('passkey.register.options'));

    $response->assertOk();
    $response->assertJsonStructure(['challenge']);
    expect(Cache::tags(['user:'.$user->id])->get('passkey_register_challenge'))->not->toBeNull();
});

test('store saves a new passkey for the authenticated user', function () {
    $user = User::factory()->create();
    $credentialIdBytes = random_bytes(32);
    $publicKeyBytes = random_bytes(64);

    $record = new CredentialRecord(
        publicKeyCredentialId: $credentialIdBytes,
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: $publicKeyBytes,
        userHandle: (string) $user->id,
        counter: 0,
    );

    $service = $this->mock(WebAuthnService::class);
    $service->shouldReceive('verifyRegistration')->once()->andReturn($record);
    $service->shouldReceive('credentialRecordToArray')->once()->andReturn([
        'credential_id' => base64_encode($credentialIdBytes),
        'public_key' => base64_encode($publicKeyBytes),
        'sign_count' => 0,
        'transports' => ['internal'],
    ]);

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Test', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );
    Cache::tags(['user:'.$user->id])->put('passkey_register_challenge', serialize($options), 300);

    $response = $this->actingAs($user)->postJson(route('passkey.register.store'), [
        'name' => 'iPhone 15',
        'id' => base64_encode($credentialIdBytes),
        'rawId' => base64_encode($credentialIdBytes),
        'type' => 'public-key',
        'response' => [
            'attestationObject' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
        ],
    ]);

    $response->assertCreated();
    $this->assertDatabaseHas('passkeys', [
        'user_id' => $user->id,
        'name' => 'iPhone 15',
    ]);
});

test('store returns 422 when credential_id already exists', function () {
    $user = User::factory()->create();
    $existing = Passkey::factory()->for($user)->create();
    $existingIdBytes = base64_decode($existing->credential_id);

    $record = new CredentialRecord(
        publicKeyCredentialId: $existingIdBytes,
        type: 'public-key',
        transports: [],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: random_bytes(64),
        userHandle: (string) $user->id,
        counter: 0,
    );

    $service = $this->mock(WebAuthnService::class);
    $service->shouldReceive('verifyRegistration')->once()->andReturn($record);
    $service->shouldReceive('credentialRecordToArray')->once()->andReturn([
        'credential_id' => $existing->credential_id,
        'public_key' => base64_encode(random_bytes(64)),
        'sign_count' => 0,
        'transports' => [],
    ]);

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Test', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );
    Cache::tags(['user:'.$user->id])->put('passkey_register_challenge', serialize($options), 300);

    $response = $this->actingAs($user)
        ->withSession(['passkey_confirmed_at' => time()])
        ->postJson(route('passkey.register.store'), [
            'name' => 'Duplicate',
            'id' => $existing->credential_id,
            'rawId' => $existing->credential_id,
            'type' => 'public-key',
            'response' => ['attestationObject' => base64_encode('data'), 'clientDataJSON' => base64_encode('{}')],
        ]);

    $response->assertUnprocessable();
});

test('destroy deletes the passkey and sends email', function () {
    Mail::fake();
    $user = User::factory()->create();
    $passkey = Passkey::factory()->for($user)->create(['name' => 'MacBook']);

    $response = $this->actingAs($user)
        ->withSession(['passkey_confirmed_at' => time()])
        ->delete(route('passkey.destroy', $passkey));

    $response->assertRedirect();
    $this->assertDatabaseMissing('passkeys', ['id' => $passkey->id]);
    Mail::assertSent(PasskeyInvalidated::class, fn ($mail) => $mail->automatic === false);
});

test('destroy prevents deleting another user\'s passkey', function () {
    $owner = User::factory()->create();
    $attacker = User::factory()->withPasskey()->create();
    $passkey = Passkey::factory()->for($owner)->create();

    $response = $this->actingAs($attacker)
        ->withSession(['passkey_confirmed_at' => time()])
        ->delete(route('passkey.destroy', $passkey));

    $response->assertForbidden();
    $this->assertDatabaseHas('passkeys', ['id' => $passkey->id]);
});

test('a mid-age confirmation clears default step-up but not the immediate window', function () {
    $user = User::factory()->withPasskey()->create(['name' => 'Original']);
    $passkey = $user->passkeys()->first();

    // Older than the 60s immediate window, well within the 15-minute default window.
    $midAge = ['passkey_confirmed_at' => time() - 300];

    $this->actingAs($user)
        ->withSession($midAge)
        ->patch(route('profile.update'), ['name' => 'Changed', 'email' => 'changed@example.com'])
        ->assertSessionHasNoErrors();
    expect($user->fresh()->name)->toBe('Changed');

    $this->actingAs($user)
        ->withSession($midAge)
        ->delete(route('passkey.destroy', $passkey))
        ->assertRedirect();
    $this->assertDatabaseHas('passkeys', ['id' => $passkey->id]);
});

test('destroy is rejected without a recent passkey confirmation', function () {
    $user = User::factory()->create();
    $passkey = Passkey::factory()->for($user)->create();

    $this->actingAs($user)
        ->delete(route('passkey.destroy', $passkey))
        ->assertRedirect();

    $this->assertDatabaseHas('passkeys', ['id' => $passkey->id]);
});

test('store is rejected when the user already has a passkey and has not confirmed', function () {
    $user = User::factory()->create();
    Passkey::factory()->for($user)->create();

    // No challenge or WebAuthn mock is set up: the step-up check must reject the
    // request before any registration work happens.
    $this->actingAs($user)
        ->postJson(route('passkey.register.store'), ['name' => 'Second key'])
        ->assertUnprocessable();

    expect($user->passkeys()->count())->toBe(1);
});

test('store allows recovery enrolment via the setup grant, then consumes it', function () {
    $user = User::factory()->create();
    // A recovering user still holds their old (lost) passkey rows.
    Passkey::factory()->for($user)->create();

    $credentialIdBytes = random_bytes(32);
    $publicKeyBytes = random_bytes(64);

    $record = new CredentialRecord(
        publicKeyCredentialId: $credentialIdBytes,
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: $publicKeyBytes,
        userHandle: (string) $user->id,
        counter: 0,
    );

    $service = $this->mock(WebAuthnService::class);
    $service->shouldReceive('verifyRegistration')->once()->andReturn($record);
    $service->shouldReceive('credentialRecordToArray')->once()->andReturn([
        'credential_id' => base64_encode($credentialIdBytes),
        'public_key' => base64_encode($publicKeyBytes),
        'sign_count' => 0,
        'transports' => ['internal'],
    ]);

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Test', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );
    Cache::tags(['user:'.$user->id])->put('passkey_register_challenge', serialize($options), 300);

    $this->actingAs($user)
        ->withSession(['passkey_setup_grant_at' => time()])
        ->postJson(route('passkey.register.store'), [
            'name' => 'Recovered key',
            'id' => base64_encode($credentialIdBytes),
            'rawId' => base64_encode($credentialIdBytes),
            'type' => 'public-key',
            'response' => ['attestationObject' => base64_encode('data'), 'clientDataJSON' => base64_encode('{}')],
        ])
        ->assertCreated()
        ->assertSessionMissing('passkey_setup_grant_at');
});

test('store rejects an expired recovery setup grant', function () {
    $user = User::factory()->create();
    // A recovering user still holds their old (lost) passkey rows.
    Passkey::factory()->for($user)->create();

    // Grant older than the default confirmation window: it must no longer waive
    // the step-up check, so a stale/stolen session can't enrol its own passkey.
    $expired = time() - (config('auth.passkey_confirm_timeout') + 60);

    // No challenge or WebAuthn mock: the step-up check must reject before any
    // registration work happens.
    $this->actingAs($user)
        ->withSession(['passkey_setup_grant_at' => $expired])
        ->postJson(route('passkey.register.store'), ['name' => 'Late key'])
        ->assertUnprocessable();

    expect($user->passkeys()->count())->toBe(1);
});
