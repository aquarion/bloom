<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Models\Tombstone;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\Denormalizer\WebauthnSerializerFactory;

class PasskeyAuthController extends Controller
{
    public function __construct(private readonly WebAuthnService $webAuthn) {}

    public function options(): Response
    {
        return $this->buildOptionsResponse(
            $this->webAuthn->generateAuthenticationOptions(),
            'passkey_auth',
        );
    }

    public function authenticate(Request $request): JsonResponse
    {
        $result = $this->resolveVerifiedPasskey($request, cachePrefix: 'passkey_auth');
        if ($result instanceof JsonResponse) {
            return $result;
        }

        if (isset($result['tombstone'])) {
            $request->session()->put('tombstone_id', $result['tombstone']->id);
            $request->session()->put('tombstone_credential_id', $result['credential_id']);

            return response()->json(['redirect' => route('tombstone.show')]);
        }

        $passkey = $result['passkey'];
        Auth::login($passkey->user);
        $passkey->user->update([
            'last_active_at' => now(),
            'inactivity_warning_sent_at' => null,
        ]);

        return response()->json(['redirect' => route('dashboard')]);
    }

    public function confirmOptions(Request $request): Response
    {
        return $this->buildOptionsResponse(
            $this->webAuthn->generateAuthenticationOptionsForUser($request->user()),
            'passkey_confirm',
        );
    }

    public function confirm(Request $request): JsonResponse
    {
        $result = $this->resolveVerifiedPasskey($request, $request->user()->id, 'passkey_confirm');
        if ($result instanceof JsonResponse) {
            return $result;
        }

        $request->session()->put('passkey_confirmed_at', time());

        return response()->json(['confirmed' => true]);
    }

    private function buildOptionsResponse(mixed $options, string $cachePrefix): Response
    {
        $token = Str::random(40);
        Cache::put("{$cachePrefix}:{$token}", serialize($options), 300);

        $serializer = (new WebauthnSerializerFactory(
            new AttestationStatementSupportManager([new NoneAttestationStatementSupport])
        ))->create();

        return response($serializer->serialize($options, 'json'), 200, [
            'Content-Type' => 'application/json',
            'X-Passkey-Token' => $token,
        ]);
    }

    /** @return array{passkey: Passkey}|array{tombstone: Tombstone, credential_id: string}|JsonResponse */
    private function resolveVerifiedPasskey(
        Request $request,
        ?int $requiredUserId = null,
        string $cachePrefix = 'passkey_auth',
    ): array|JsonResponse {
        $token = $request->header('X-Passkey-Token');
        $serialized = $token ? Cache::pull("{$cachePrefix}:{$token}") : null;
        if (! $serialized) {
            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        try {
            $options = unserialize($serialized);
        } catch (Throwable $e) {
            Log::warning('Failed to unserialize passkey challenge', ['exception' => $e->getMessage()]);

            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        $rawId = $request->input('rawId');
        if (! is_string($rawId) || $rawId === '') {
            return response()->json(['message' => 'Invalid credential.'], 422);
        }

        $base64 = strtr($rawId, '-_', '+/');
        $padded = str_pad($base64, (int) ceil(strlen($base64) / 4) * 4, '=');
        $decoded = base64_decode($padded, strict: true);
        if ($decoded === false) {
            return response()->json(['message' => 'Invalid credential.'], 422);
        }
        $credentialId = base64_encode($decoded);

        $query = Passkey::where('credential_id', $credentialId);
        if ($requiredUserId !== null) {
            $query->where('user_id', $requiredUserId);
        }
        $passkey = $query->first();

        if (! $passkey) {
            if ($requiredUserId !== null) {
                return response()->json(['message' => 'Passkey not recognised.'], 401);
            }

            $tombstoneMatch = $this->findTombstoneByCredentialId($credentialId);
            if (! $tombstoneMatch) {
                return response()->json(['message' => 'Passkey not recognised.'], 401);
            }

            return $this->verifyTombstonedPasskey($tombstoneMatch, $request, $options, $credentialId);
        }

        try {
            $source = $this->webAuthn->verifyAuthentication(
                json_encode($request->all()),
                $options,
                $passkey,
            );
        } catch (Throwable $e) {
            Log::warning('Passkey authentication verification failed', [
                'exception' => $e->getMessage(),
                'user_id' => $requiredUserId,
            ]);

            return response()->json(['message' => 'Passkey verification failed.'], 401);
        }

        // A counter of 0 means the authenticator doesn't implement counters; only check for
        // equal-or-lower counters when the authenticator tracks them, per WebAuthn §6.1.
        if ($source->counter !== 0 && $source->counter <= $passkey->sign_count) {
            /** @var User $user */
            $user = $passkey->user;
            Mail::to($user->email)->send(new PasskeyInvalidated($passkey, automatic: true));
            $passkey->delete();

            return response()->json(['message' => 'Passkey invalidated due to replay attack.'], 401);
        }

        $passkey->update([
            'sign_count' => $source->counter,
            'last_used_at' => now(),
        ]);

        return ['passkey' => $passkey];
    }

    /** @return array{tombstone: Tombstone, archived_passkey: array<string, mixed>}|null */
    private function findTombstoneByCredentialId(string $credentialId): ?array
    {
        foreach (Tombstone::select(['id', 'schema_version', 'archived_passkeys'])->cursor() as $tombstone) {
            $match = $tombstone->findArchivedPasskey($credentialId);

            if ($match) {
                return ['tombstone' => $tombstone, 'archived_passkey' => $match];
            }
        }

        return null;
    }

    /**
     * @param  array{tombstone: Tombstone, archived_passkey: array<string, mixed>}  $tombstoneMatch
     * @return array{tombstone: Tombstone, credential_id: string}|JsonResponse
     */
    private function verifyTombstonedPasskey(
        array $tombstoneMatch,
        Request $request,
        mixed $options,
        string $credentialId,
    ): array|JsonResponse {
        /** @var Tombstone $tombstone */
        $tombstone = $tombstoneMatch['tombstone'];
        $archived = $tombstoneMatch['archived_passkey'];

        if ($tombstone->schema_version !== Tombstone::CURRENT_SCHEMA_VERSION) {
            Log::warning('Tombstone passkey lookup hit an unrecognised schema version', [
                'tombstone_id' => $tombstone->id,
                'schema_version' => $tombstone->schema_version,
            ]);

            return response()->json(['message' => 'Passkey verification failed.'], 401);
        }

        $transientPasskey = new Passkey([
            'credential_id' => $archived['credential_id'],
            'public_key' => $archived['public_key'],
            'sign_count' => $archived['sign_count'],
            'transports' => $archived['transports'],
        ]);

        try {
            $this->webAuthn->verifyAuthentication(
                json_encode($request->all()),
                $options,
                $transientPasskey,
            );
        } catch (Throwable $e) {
            Log::warning('Tombstoned passkey verification failed', ['exception' => $e->getMessage()]);

            return response()->json(['message' => 'Passkey verification failed.'], 401);
        }

        return ['tombstone' => $tombstone, 'credential_id' => $credentialId];
    }
}
