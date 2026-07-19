<?php

namespace App\Http\Controllers\Settings;

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
