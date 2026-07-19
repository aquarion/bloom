<?php

use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\Uid\Uuid;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\TrustPath\EmptyTrustPath;

test('registering a passkey stamps last_active_at', function () {
    $user = User::factory()->create(['last_active_at' => null]);
    $this->actingAs($user);

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Bloom', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );
    Cache::tags(['user:'.$user->id])->put('passkey_register_challenge', serialize($options), 300);

    $record = new CredentialRecord(
        publicKeyCredentialId: random_bytes(16),
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: random_bytes(32),
        userHandle: (string) $user->id,
        counter: 0,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('generateRegistrationOptions')
        ->andReturn($options)
        ->shouldReceive('verifyRegistration')
        ->once()
        ->andReturn($record)
        ->shouldReceive('credentialRecordToArray')
        ->once()
        ->andReturn([
            'credential_id' => base64_encode('cred-id'),
            'public_key' => base64_encode('pubkey'),
            'sign_count' => 0,
            'transports' => ['internal'],
        ]);

    $this->postJson(route('passkey.register.store'), ['name' => 'New Key'])->assertCreated();

    expect($user->fresh()->last_active_at)->not->toBeNull();
});
