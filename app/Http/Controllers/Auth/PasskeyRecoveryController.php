<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyRecovery;
use App\Models\PasskeyRecoveryToken;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class PasskeyRecoveryController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('auth/recover');
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate(['email' => 'required|email']);

        $user = User::where('email', strtolower($request->input('email')))->first();

        if ($user) {
            PasskeyRecoveryToken::where('user_id', $user->id)
                ->whereNull('used_at')
                ->delete();

            $token = Str::random(40);

            PasskeyRecoveryToken::create([
                'user_id' => $user->id,
                'token' => hash('sha256', $token),
            ]);

            $url = route('passkey.recover.setup', ['token' => $token]);

            try {
                Mail::to($user->email)->send(new PasskeyRecovery($user, $url));
            } catch (Throwable $e) {
                // Log but do not re-throw — a mail failure must not reveal whether the account exists,
                // and the token is in the DB so the user can request a new one.
                Log::error('Failed to send passkey recovery email', [
                    'user_id' => $user->id,
                    'exception' => $e->getMessage(),
                ]);
            }
        }

        // Always redirect with the same message to prevent email enumeration.
        // Note: response timing is not equalised; a found user triggers token creation before this line.
        return redirect()->route('passkey.recover.sent');
    }

    public function sent(): Response
    {
        return Inertia::render('auth/recover-sent');
    }

    public function setup(string $token): RedirectResponse|Response
    {
        $record = PasskeyRecoveryToken::where('token', hash('sha256', $token))
            ->whereNull('used_at')
            ->where('created_at', '>', now()->subHour())
            ->with('user')
            ->first();

        if (! $record) {
            return Inertia::render('auth/recover-invalid');
        }

        $user = $record->user;

        if (! $user) {
            Log::warning('Passkey recovery token referenced a deleted user', ['token_id' => $record->id]);

            return Inertia::render('auth/recover-invalid');
        }

        $record->update(['used_at' => now()]);

        Auth::login($user);

        return redirect()->route('passkey.setup')
            ->with('status', 'recovery');
    }
}
