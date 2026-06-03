<?php

use App\Models\Passkey;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Webauthn\PublicKeyCredentialRequestOptions;

test('user without passkeys is redirected to passkey setup when accessing dashboard', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertRedirect(route('passkey.setup'));
});

test('user with passkeys can access dashboard', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertOk();
});

test('user without passkeys can access passkey setup', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->withoutVite()
        ->get(route('passkey.setup'))
        ->assertOk();
});

test('user without passkeys can access passkey register options', function () {
    $user = User::factory()->create();

    // The register options endpoint returns WebAuthn JSON, not an Inertia redirect.
    // This verifies EnsurePasskeyExists lets the enrolment API through.
    $this->actingAs($user)
        ->getJson(route('passkey.register.options'))
        ->assertOk();
});

test('delete without passkey confirmation is rejected', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->delete(route('profile.destroy'))
        ->assertRedirect();

    expect($user->fresh())->not->toBeNull();
});

test('delete with expired passkey confirmation is rejected', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)
        ->withSession(['passkey_confirmed_at' => time() - 600])
        ->delete(route('profile.destroy'))
        ->assertRedirect();

    expect($user->fresh())->not->toBeNull();
});

test('confirm endpoint rejects a passkey belonging to a different user', function () {
    $owner = User::factory()->withPasskey()->create();
    $attacker = User::factory()->withPasskey()->create();

    $otherPasskey = Passkey::where('user_id', $owner->id)->first();

    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
    $token = 'test-confirm-cross-user';
    Cache::put("passkey_auth:{$token}", serialize($options), 300);

    $rawId = rtrim(strtr(base64_encode(base64_decode($otherPasskey->credential_id)), '+/', '-_'), '=');

    // Attacker is logged in as themselves but posts the owner's credential ID.
    // resolveVerifiedPasskey() adds WHERE user_id = attacker->id, so the passkey won't be found.
    $this->actingAs($attacker)
        ->postJson(route('passkey.confirm'), [
            'id' => $rawId,
            'rawId' => $rawId,
            'type' => 'public-key',
            'response' => [
                'authenticatorData' => base64_encode('data'),
                'clientDataJSON' => base64_encode('{}'),
                'signature' => base64_encode('sig'),
            ],
        ], ['X-Passkey-Token' => $token])
        ->assertStatus(401);

    expect(session('passkey_confirmed_at'))->toBeNull();
});
