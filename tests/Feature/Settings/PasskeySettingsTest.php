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

    $response = $this->actingAs($user)->postJson(route('passkey.register.store'), [
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
        ->delete(route('passkey.destroy', $passkey));

    $response->assertForbidden();
    $this->assertDatabaseHas('passkeys', ['id' => $passkey->id]);
});
