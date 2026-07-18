<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyRecovery;
use App\Mail\TombstoneRecovery;
use App\Models\PasskeyRecoveryToken;
use App\Models\Tombstone;
use App\Models\TombstoneRecoveryToken;
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

        $email = strtolower($request->input('email'));
        $user = User::where('email', $email)->first();

        if ($user) {
            $this->sendUserRecovery($user);
        } else {
            $tombstone = Tombstone::where('email', $email)->first();

            if ($tombstone) {
                $this->sendTombstoneRecovery($tombstone);
            }
        }

        // Always redirect with the same message to prevent email enumeration.
        // Note: response timing is not equalised; a found user/tombstone triggers
        // token creation before this line.
        return redirect()->route('passkey.recover.sent');
    }

    public function sent(): Response
    {
        return Inertia::render('auth/recover-sent');
    }

    public function setup(string $token): RedirectResponse|Response
    {
        $hashedToken = hash('sha256', $token);

        $passkeyRecord = PasskeyRecoveryToken::where('token', $hashedToken)
            ->whereNull('used_at')
            ->where('created_at', '>', now()->subHour())
            ->with('user')
            ->first();

        if ($passkeyRecord) {
            $user = $passkeyRecord->user;

            if (! $user) {
                Log::warning('Passkey recovery token referenced a deleted user', ['token_id' => $passkeyRecord->id]);

                return Inertia::render('auth/recover-invalid');
            }

            $passkeyRecord->consume();

            Auth::login($user);

            return redirect()->route('passkey.setup')
                ->with('status', 'recovery');
        }

        $tombstoneRecord = TombstoneRecoveryToken::where('token', $hashedToken)
            ->whereNull('used_at')
            ->where('created_at', '>', now()->subHour())
            ->with('tombstone')
            ->first();

        if ($tombstoneRecord && $tombstoneRecord->tombstone) {
            $tombstoneRecord->consume();

            session(['tombstone_id' => $tombstoneRecord->tombstone->id]);

            return redirect()->route('tombstone.show');
        }

        return Inertia::render('auth/recover-invalid');
    }

    private function sendUserRecovery(User $user): void
    {
        PasskeyRecoveryToken::where('user_id', $user->id)
            ->whereNull('used_at')
            ->delete();

        $token = Str::random(40);

        PasskeyRecoveryToken::createForUser($user, $token);

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

    private function sendTombstoneRecovery(Tombstone $tombstone): void
    {
        TombstoneRecoveryToken::where('tombstone_id', $tombstone->id)
            ->whereNull('used_at')
            ->delete();

        $token = Str::random(40);

        TombstoneRecoveryToken::createForTombstone($tombstone, $token);

        $url = route('passkey.recover.setup', ['token' => $token]);

        try {
            Mail::to($tombstone->email)->send(new TombstoneRecovery($tombstone, $url));
        } catch (Throwable $e) {
            // Log but do not re-throw — a mail failure must not reveal whether the tombstone exists,
            // and the token is in the DB so the user can request a new one.
            Log::error('Failed to send tombstone recovery email', [
                'tombstone_id' => $tombstone->id,
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
