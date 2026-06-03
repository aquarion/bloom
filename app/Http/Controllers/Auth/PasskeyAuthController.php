<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
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
        $options = $this->webAuthn->generateAuthenticationOptions();
        $token = Str::random(40);
        Cache::put("passkey_auth:{$token}", serialize($options), 300);

        $serializer = (new WebauthnSerializerFactory(
            new AttestationStatementSupportManager([new NoneAttestationStatementSupport])
        ))->create();

        return response($serializer->serialize($options, 'json'), 200, [
            'Content-Type' => 'application/json',
            'X-Passkey-Token' => $token,
        ]);
    }

    public function authenticate(Request $request): JsonResponse
    {
        $result = $this->resolveVerifiedPasskey($request);
        if ($result instanceof JsonResponse) {
            return $result;
        }

        Auth::login($result['passkey']->user);

        return response()->json(['redirect' => route('dashboard')]);
    }

    public function confirm(Request $request): JsonResponse
    {
        $result = $this->resolveVerifiedPasskey($request, $request->user()->id);
        if ($result instanceof JsonResponse) {
            return $result;
        }

        $request->session()->put('passkey_confirmed_at', time());

        return response()->json(['confirmed' => true]);
    }

    /** @return array{passkey: Passkey}|JsonResponse */
    private function resolveVerifiedPasskey(Request $request, ?int $requiredUserId = null): array|JsonResponse
    {
        $token = $request->header('X-Passkey-Token');
        $serialized = $token ? Cache::pull("passkey_auth:{$token}") : null;
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
            return response()->json(['message' => 'Passkey not recognised.'], 401);
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
}
