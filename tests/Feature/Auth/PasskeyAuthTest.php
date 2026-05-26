<?php

use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Uid\Uuid;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\TrustPath\EmptyTrustPath;

test('options endpoint returns a challenge and stores it in cache', function () {
    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('generateAuthenticationOptions')
        ->once()
        ->andReturn($options);

    $response = $this->getJson(route('passkey.auth.options'));

    $response->assertOk();
    $response->assertJsonStructure(['challenge']);
    $token = $response->headers->get('X-Passkey-Token');
    expect($token)->not->toBeNull();
    expect(Cache::get("passkey_auth:{$token}"))->not->toBeNull();
});

test('authenticate endpoint logs in user with valid assertion', function () {
    $user = User::factory()->create();
    $passkey = Passkey::factory()->for($user)->create(['sign_count' => 0]);

    $updatedRecord = new CredentialRecord(
        publicKeyCredentialId: base64_decode($passkey->credential_id),
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: base64_decode($passkey->public_key),
        userHandle: (string) $user->id,
        counter: 1,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andReturn($updatedRecord);

    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
    $token = 'test-token-authenticate';
    Cache::put("passkey_auth:{$token}", serialize($options), 300);

    $rawId = rtrim(strtr(base64_encode(base64_decode($passkey->credential_id)), '+/', '-_'), '=');

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id' => $rawId,
        'rawId' => $rawId,
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ], ['X-Passkey-Token' => $token]);

    $response->assertOk();
    $this->assertAuthenticatedAs($user);
    expect($passkey->fresh()->sign_count)->toBe(1);
    expect($passkey->fresh()->last_used_at)->not->toBeNull();
});

test('authenticate endpoint returns 401 when passkey not found', function () {
    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
    $token = 'test-token-not-found';
    Cache::put("passkey_auth:{$token}", serialize($options), 300);

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id' => base64_encode('unknown-cred'),
        'rawId' => base64_encode('unknown-cred'),
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ], ['X-Passkey-Token' => $token]);

    $response->assertUnauthorized();
    $this->assertGuest();
});

test('authenticate endpoint returns 422 when cache challenge is missing', function () {
    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id' => base64_encode('cred'),
        'rawId' => base64_encode('cred'),
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ]);

    $response->assertUnprocessable();
});

test('authenticate endpoint deletes passkey and sends email on sign_count regression', function () {
    Mail::fake();

    $user = User::factory()->create();
    $passkey = Passkey::factory()->for($user)->create(['sign_count' => 10]);

    $regressedRecord = new CredentialRecord(
        publicKeyCredentialId: base64_decode($passkey->credential_id),
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: base64_decode($passkey->public_key),
        userHandle: (string) $user->id,
        counter: 5,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andReturn($regressedRecord);

    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
    $token = 'test-token-regression';
    Cache::put("passkey_auth:{$token}", serialize($options), 300);

    $rawId = rtrim(strtr(base64_encode(base64_decode($passkey->credential_id)), '+/', '-_'), '=');

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id' => $rawId,
        'rawId' => $rawId,
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ], ['X-Passkey-Token' => $token]);

    $response->assertUnauthorized();
    $this->assertGuest();
    $this->assertDatabaseMissing('passkeys', ['id' => $passkey->id]);
    Mail::assertSent(PasskeyInvalidated::class, fn ($mail) => $mail->automatic === true);
});
