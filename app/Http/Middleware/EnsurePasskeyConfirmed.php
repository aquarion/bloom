<?php

namespace App\Http\Middleware;

use App\Concerns\ConfirmsPasskeyIdentity;
use App\Enums\PasskeyConfirmMode;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasskeyConfirmed
{
    use ConfirmsPasskeyIdentity;

    /**
     * @param  string  $mode  'default' reuses a recent confirmation (config
     *                        auth.passkey_confirm_timeout); 'immediate' is the
     *                        tight window for the most dangerous actions
     *                        (auth.passkey_confirm_immediate_timeout). An
     *                        unrecognised value throws (fail closed) rather than
     *                        silently downgrading to the weaker window.
     */
    public function handle(Request $request, Closure $next, string $mode = 'default'): Response
    {
        if (! $this->passkeyConfirmedWithin($request, PasskeyConfirmMode::from($mode))) {
            return redirect()->back(302, [], route('profile.edit'))
                ->withErrors(['passkey' => 'Please confirm your identity to continue.']);
        }

        return $next($request);
    }
}
