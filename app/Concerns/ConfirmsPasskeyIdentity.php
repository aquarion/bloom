<?php

namespace App\Concerns;

use App\Enums\PasskeyConfirmMode;
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
     * Both modes read the same confirmation timestamp; they differ only in how
     * recent it must be. `immediate` is a tight 60-second window for the most
     * dangerous actions, so in the normal client flow (which always taps for
     * those) the confirmation is effectively fresh; `default` reuses a
     * confirmation for up to 15 minutes.
     */
    protected function passkeyConfirmedWithin(Request $request, PasskeyConfirmMode $mode = PasskeyConfirmMode::Default): bool
    {
        $confirmedAt = $this->passkeyConfirmedAt($request);

        if ($confirmedAt <= 0) {
            return false;
        }

        return (time() - $confirmedAt) <= $mode->timeoutSeconds();
    }

    /**
     * Epoch-milliseconds until which the current confirmation stays valid for
     * default-mode actions, or null when there is no live confirmation. Shared
     * with the frontend so it can skip a redundant tap. Note this reflects the
     * default window only; immediate-mode gates apply their own tighter check.
     */
    protected function passkeyConfirmedUntilMs(Request $request): ?int
    {
        $confirmedAt = $this->passkeyConfirmedAt($request);

        if ($confirmedAt <= 0) {
            return null;
        }

        $untilMs = ($confirmedAt + PasskeyConfirmMode::Default->timeoutSeconds()) * 1000;

        return $untilMs > time() * 1000 ? $untilMs : null;
    }

    /**
     * Grant a one-time waiver of the add-passkey step-up check for this session.
     * Used after a token-verified recovery, where the user's old passkey rows
     * still exist so enrolment can't rely on "no passkey yet". The grant is
     * timestamped so it expires with the default window rather than living as
     * long as the (now 14-day) session.
     */
    protected function grantPasskeySetupWaiver(Request $request): void
    {
        $request->session()->put('passkey_setup_grant_at', time());
    }

    /**
     * Whether a still-valid setup waiver is present. Expires with the default
     * confirmation window so a stolen session can't carry it indefinitely.
     */
    protected function hasValidPasskeySetupWaiver(Request $request): bool
    {
        $grantedAt = (int) $request->session()->get('passkey_setup_grant_at', 0);

        if ($grantedAt <= 0) {
            return false;
        }

        return (time() - $grantedAt) <= PasskeyConfirmMode::Default->timeoutSeconds();
    }

    /**
     * Consume the setup waiver so it can be used for at most one enrolment.
     */
    protected function consumePasskeySetupWaiver(Request $request): void
    {
        $request->session()->forget('passkey_setup_grant_at');
    }

    private function passkeyConfirmedAt(Request $request): int
    {
        return (int) $request->session()->get('passkey_confirmed_at', 0);
    }
}
