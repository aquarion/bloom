<?php

namespace App\Http\Controllers\Settings;

use App\Concerns\ConfirmsPasskeyIdentity;
use App\Http\Controllers\Controller;
use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\Denormalizer\WebauthnSerializerFactory;

class PasskeyController extends Controller
{
    use ConfirmsPasskeyIdentity;

    public function __construct(private readonly WebAuthnService $webAuthn) {}

    public function registerOptions(Request $request): Response
    {
        $options = $this->webAuthn->generateRegistrationOptions($request->user());
        Cache::tags(['user:'.$request->user()->id])->put('passkey_register_challenge', serialize($options), 300);

        $serializer = (new WebauthnSerializerFactory(
            new AttestationStatementSupportManager([new NoneAttestationStatementSupport])
        ))->create();

        return response($serializer->serialize($options, 'json'), 200, [
            'Content-Type' => 'application/json',
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:255']]);

        // Adding a passkey is a step-up action: an attacker on a live session must
        // not be able to silently enrol their own authenticator. It is waived only
        // during initial enrolment (no passkey yet) or a token-verified recovery,
        // where the user has no usable passkey to confirm with.
        $setupGranted = (bool) $request->session()->get('passkey_setup_grant', false);
        $enrolling = $setupGranted || ! $request->user()->passkeys()->exists();

        if (! $enrolling && ! $this->passkeyConfirmedWithin($request, 'immediate')) {
            return response()->json(['message' => 'Please confirm your identity to continue.'], 422);
        }

        $serialized = Cache::tags(['user:'.$request->user()->id])->pull('passkey_register_challenge');

        if (! $serialized) {
            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        $options = unserialize($serialized);

        try {
            $source = $this->webAuthn->verifyRegistration(
                json_encode($request->except('name')),
                $options,
            );
        } catch (Throwable $e) {
            Log::warning('Passkey registration verification failed', ['exception' => $e->getMessage()]);

            return response()->json(['message' => 'Passkey verification failed. Please try again.'], 422);
        }

        $data = $this->webAuthn->credentialRecordToArray($source);

        if (Passkey::where('credential_id', $data['credential_id'])->exists()) {
            return response()->json(['message' => 'This passkey is already registered.'], 422);
        }

        $passkey = $request->user()->passkeys()->create([
            'name' => $request->input('name'),
            ...$data,
        ]);

        $request->user()->update(['last_active_at' => now(), 'inactivity_warning_sent_at' => null]);

        // One enrolment per grant: a recovering user can add their new passkey, but
        // the waiver cannot be reused to add further passkeys without a fresh tap.
        $request->session()->forget('passkey_setup_grant');

        return response()->json($passkey->only('id', 'name', 'last_used_at', 'created_at'), 201);
    }

    public function destroy(Request $request, Passkey $passkey): RedirectResponse
    {
        if ($passkey->user_id !== $request->user()->id) {
            abort(403);
        }

        Mail::to($request->user()->email)->send(new PasskeyInvalidated($passkey, automatic: false));
        $passkey->delete();

        return back();
    }
}
