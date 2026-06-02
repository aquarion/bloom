<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyRecovery;
use App\Models\PasskeyRecoveryToken;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class PasskeyRecoveryController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('auth/recover');
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate(['email' => 'required|email']);

        $email = strtolower($request->input('email'));
        $user = User::where('email', $email)->first();

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

            Mail::to($user->email)->send(new PasskeyRecovery($user, $url));
        }

        // Always redirect with the same message to prevent email enumeration
        return redirect()->route('passkey.recover.sent');
    }

    public function sent(): Response
    {
        return Inertia::render('auth/recover-sent');
    }

    public function setup(string $token): RedirectResponse|Response
    {
        $record = PasskeyRecoveryToken::where('token', hash('sha256', $token))->with('user')->first();

        if (! $record || ! $record->isValid()) {
            return Inertia::render('auth/recover-invalid');
        }

        $record->update(['used_at' => now()]);

        Auth::login($record->user);

        return redirect()->route('passkey.setup')
            ->with('status', 'recovery');
    }
}
