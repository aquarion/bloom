<?php

namespace App\Concerns;

use Illuminate\Http\Request;

/**
 * Shared logic for step-up ("sudo") auth: has the current session confirmed a
 * passkey recently enough for a sensitive action?
 */
trait ConfirmsPasskeyIdentity
{
    /**
     * Whether the session holds a passkey confirmation still valid for the given mode.
     *
     * @param  string  $mode  'default' reuses a recent confirmation
     *                        (auth.passkey_confirm_timeout); 'immediate' demands a
     *                        fresh tap (auth.passkey_confirm_immediate_timeout).
     */
    protected function passkeyConfirmedWithin(Request $request, string $mode = 'default'): bool
    {
        $confirmedAt = (int) $request->session()->get('passkey_confirmed_at', 0);

        if ($confirmedAt <= 0) {
            return false;
        }

        return (time() - $confirmedAt) <= $this->passkeyConfirmTimeout($mode);
    }

    /**
     * Epoch-milliseconds until which the current confirmation stays valid for
     * default-mode actions, or null when there is no live confirmation. Shared
     * with the frontend so it can skip a redundant tap.
     */
    protected function passkeyConfirmedUntilMs(Request $request): ?int
    {
        $confirmedAt = (int) $request->session()->get('passkey_confirmed_at', 0);

        if ($confirmedAt <= 0) {
            return null;
        }

        $untilMs = ($confirmedAt + $this->passkeyConfirmTimeout('default')) * 1000;

        return $untilMs > time() * 1000 ? $untilMs : null;
    }

    private function passkeyConfirmTimeout(string $mode): int
    {
        return $mode === 'immediate'
            ? (int) config('auth.passkey_confirm_immediate_timeout', 60)
            : (int) config('auth.passkey_confirm_timeout', 900);
    }
}
