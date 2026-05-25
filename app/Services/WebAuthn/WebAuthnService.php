<?php

// app/Services/WebAuthn/WebAuthnService.php

namespace App\Services\WebAuthn;

use App\Models\Passkey;
use App\Models\User;
use Symfony\Component\Uid\Uuid;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\CredentialRecord;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\TrustPath\EmptyTrustPath;

class WebAuthnService
{
    private function rpId(): string
    {
        return parse_url(config('app.url'), PHP_URL_HOST);
    }

    private function origin(): string
    {
        return config('app.url');
    }

    public function generateRegistrationOptions(User $user): PublicKeyCredentialCreationOptions
    {
        return new PublicKeyCredentialCreationOptions(
            rp: new PublicKeyCredentialRpEntity(
                name: config('app.name'),
                id: $this->rpId(),
            ),
            user: new PublicKeyCredentialUserEntity(
                name: $user->email,
                id: (string) $user->id,
                displayName: $user->name,
            ),
            challenge: random_bytes(32),
            pubKeyCredParams: [
                new PublicKeyCredentialParameters(type: 'public-key', alg: -7),
                new PublicKeyCredentialParameters(type: 'public-key', alg: -257),
            ],
            authenticatorSelection: new AuthenticatorSelectionCriteria(
                residentKey: AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED,
                userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_PREFERRED,
            ),
        );
    }

    public function generateAuthenticationOptions(): PublicKeyCredentialRequestOptions
    {
        return new PublicKeyCredentialRequestOptions(
            challenge: random_bytes(32),
            rpId: $this->rpId(),
            allowCredentials: [],
            userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
        );
    }

    public function verifyRegistration(
        string $credentialJson,
        PublicKeyCredentialCreationOptions $options,
    ): CredentialRecord {
        $credential = $this->loadCredential($credentialJson);

        $factory = new CeremonyStepManagerFactory;
        $factory->setAllowedOrigins([$this->origin()]);

        $validator = AuthenticatorAttestationResponseValidator::create($factory->creationCeremony());

        return $validator->check(
            $credential->response,
            $options,
            $this->rpId(),
        );
    }

    public function verifyAuthentication(
        string $credentialJson,
        PublicKeyCredentialRequestOptions $options,
        Passkey $passkey,
    ): CredentialRecord {
        $credential = $this->loadCredential($credentialJson);

        $factory = new CeremonyStepManagerFactory;
        $factory->setAllowedOrigins([$this->origin()]);

        $validator = AuthenticatorAssertionResponseValidator::create($factory->requestCeremony());

        return $validator->check(
            $this->passkeyToCredentialRecord($passkey),
            $credential->response,
            $options,
            $this->rpId(),
            null,
        );
    }

    public function credentialRecordToArray(CredentialRecord $record): array
    {
        return [
            'credential_id' => base64_encode($record->publicKeyCredentialId),
            'public_key' => base64_encode($record->credentialPublicKey),
            'sign_count' => $record->counter,
            'transports' => $record->transports,
        ];
    }

    public function passkeyToCredentialRecord(Passkey $passkey): CredentialRecord
    {
        return new CredentialRecord(
            publicKeyCredentialId: base64_decode($passkey->credential_id),
            type: 'public-key',
            transports: $passkey->transports ?? [],
            attestationType: 'none',
            trustPath: new EmptyTrustPath,
            aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
            credentialPublicKey: base64_decode($passkey->public_key),
            userHandle: (string) $passkey->user_id,
            counter: $passkey->sign_count,
        );
    }

    private function loadCredential(string $json): PublicKeyCredential
    {
        $serializer = (new WebauthnSerializerFactory(
            new AttestationStatementSupportManager([new NoneAttestationStatementSupport])
        ))->create();

        return $serializer->deserialize($json, PublicKeyCredential::class, 'json');
    }
}
