<?php

namespace App\Enums;

/**
 * Step-up ("sudo") auth window for a sensitive action. Backed by the string
 * used in the `passkey.confirmed:{mode}` route middleware, so an unrecognised
 * mode fails closed via a ValueError rather than silently downgrading to the
 * weaker window.
 */
enum PasskeyConfirmMode: string
{
    case Default = 'default';
    case Immediate = 'immediate';

    /**
     * Seconds a confirmation stays valid for this mode.
     */
    public function timeoutSeconds(): int
    {
        return match ($this) {
            self::Default => (int) config('auth.passkey_confirm_timeout', 900),
            self::Immediate => (int) config('auth.passkey_confirm_immediate_timeout', 60),
        };
    }
}
