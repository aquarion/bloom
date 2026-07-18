<?php

use App\Models\Passkey;
use App\Models\Tombstone;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\Uid\Uuid;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\TrustPath\EmptyTrustPath;

function tombstoneAuthOptions(): PublicKeyCredentialRequestOptions
{
    return new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
}

test('a verified tombstoned credential redirects to the archived interstitial instead of logging in', function () {
    $tombstone = Tombstone::factory()->create([
        'archived_passkeys' => [[
            'credential_id' => base64_encode('tombstoned-cred'),
            'public_key' => base64_encode('tombstoned-pubkey'),
            'sign_count' => 4,
            'transports' => ['internal'],
            'name' => 'Old Phone',
        ]],
    ]);

    $credentialRecord = new CredentialRecord(
        publicKeyCredentialId: base64_decode(base64_encode('tombstoned-cred')),
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: base64_decode(base64_encode('tombstoned-pubkey')),
        userHandle: '',
        counter: 5,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andReturn($credentialRecord);

    $token = 'tombstone-token';
    Cache::put("passkey_auth:{$token}", serialize(tombstoneAuthOptions()), 300);

    $rawId = rtrim(strtr(base64_encode('tombstoned-cred'), '+/', '-_'), '=');

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
    $response->assertJson(['redirect' => route('tombstone.show')]);
    $this->assertGuest();
    expect(session('tombstone_id'))->toBe($tombstone->id);
});

test('a tombstoned credential with a bad signature gets the identical generic failure as any bad attempt', function () {
    Tombstone::factory()->create([
        'archived_passkeys' => [[
            'credential_id' => base64_encode('tombstoned-cred-2'),
            'public_key' => base64_encode('tombstoned-pubkey-2'),
            'sign_count' => 4,
            'transports' => ['internal'],
            'name' => 'Old Phone',
        ]],
    ]);

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andThrow(new Exception('bad signature'));

    $token = 'tombstone-token-bad-sig';
    Cache::put("passkey_auth:{$token}", serialize(tombstoneAuthOptions()), 300);

    $rawId = rtrim(strtr(base64_encode('tombstoned-cred-2'), '+/', '-_'), '=');

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
    $response->assertJson(['message' => 'Passkey verification failed.']);
    $this->assertGuest();
});

test('login stamps last_active_at and clears any pending inactivity warning', function () {
    $user = User::factory()->create([
        'last_active_at' => now()->subDays(50),
        'inactivity_warning_sent_at' => now()->subDay(),
    ]);
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

    $token = 'login-activity-token';
    Cache::put("passkey_auth:{$token}", serialize(tombstoneAuthOptions()), 300);

    $rawId = rtrim(strtr(base64_encode(base64_decode($passkey->credential_id)), '+/', '-_'), '=');

    $this->postJson(route('passkey.auth.authenticate'), [
        'id' => $rawId,
        'rawId' => $rawId,
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ], ['X-Passkey-Token' => $token])->assertOk();

    $fresh = $user->fresh();
    expect($fresh->last_active_at->isToday())->toBeTrue();
    expect($fresh->inactivity_warning_sent_at)->toBeNull();
});
