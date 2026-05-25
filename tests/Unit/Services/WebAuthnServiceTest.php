<?php

// tests/Unit/Services/WebAuthnServiceTest.php

use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Tests\TestCase;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialRequestOptions;

uses(TestCase::class);

test('generateRegistrationOptions returns creation options with rp and two algorithms', function () {
    $user = User::factory()->make(['id' => 1, 'email' => 'test@example.com', 'name' => 'Test User']);
    $service = new WebAuthnService;

    $options = $service->generateRegistrationOptions($user);

    expect($options)->toBeInstanceOf(PublicKeyCredentialCreationOptions::class)
        ->and($options->rp->name)->toBe(config('app.name'))
        ->and(strlen($options->challenge))->toBeGreaterThan(0)
        ->and($options->pubKeyCredParams)->toHaveCount(2);
});

test('generateRegistrationOptions each call produces a different challenge', function () {
    $user = User::factory()->make(['id' => 1]);
    $service = new WebAuthnService;

    $a = $service->generateRegistrationOptions($user);
    $b = $service->generateRegistrationOptions($user);

    expect($a->challenge)->not->toBe($b->challenge);
});

test('generateAuthenticationOptions returns request options with empty allowCredentials', function () {
    $service = new WebAuthnService;

    $options = $service->generateAuthenticationOptions();

    expect($options)->toBeInstanceOf(PublicKeyCredentialRequestOptions::class)
        ->and(strlen($options->challenge))->toBeGreaterThan(0)
        ->and($options->allowCredentials)->toBeEmpty();
});
