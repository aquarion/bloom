<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
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
        session(['passkey.register.options' => serialize($options)]);

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

        $serialized = session('passkey.register.options');
        if (! $serialized) {
            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        $options = unserialize($serialized);
        session()->forget('passkey.register.options');

        try {
            $source = $this->webAuthn->verifyRegistration(
                json_encode($request->except('name')),
                $options,
            );
        } catch (Throwable $e) {
            return response()->json(['message' => 'Passkey verification failed: '.$e->getMessage()], 422);
        }

        $data = $this->webAuthn->credentialRecordToArray($source);

        if (Passkey::where('credential_id', $data['credential_id'])->exists()) {
            return response()->json(['message' => 'This passkey is already registered.'], 422);
        }

        $passkey = $request->user()->passkeys()->create([
            'name' => $request->input('name'),
            ...$data,
        ]);

        return response()->json($passkey->only('id', 'name', 'last_used_at', 'created_at'), 201);
    }

    public function destroy(Request $request, Passkey $passkey): JsonResponse
    {
        if ($passkey->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        Mail::to($request->user()->email)->send(new PasskeyInvalidated($passkey, automatic: false));
        $passkey->delete();

        return response()->json(['message' => 'Passkey removed.']);
    }
}
