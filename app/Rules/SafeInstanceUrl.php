<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Log;

/**
 * Rejects a provider instance/PDS URL that isn't a plain HTTPS host, or that resolves
 * (directly as a bare IP, or via DNS) to a private/reserved IP range — guards the
 * connect flows against SSRF to internal services. Consolidates what used to be three
 * near-identical, drifted implementations across BlueskyController, MastodonController,
 * and ConnectionsController.
 */
class SafeInstanceUrl implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $parsed = parse_url((string) $value);

        if (! $parsed || ($parsed['scheme'] ?? '') !== 'https') {
            $fail('The :attribute must use HTTPS.');

            return;
        }

        $host = $parsed['host'] ?? '';

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (! filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                Log::warning('Blocked instance URL with a bare private/reserved IP host', ['host' => $host]);
                $fail('The :attribute is not allowed.');
            }

            return;
        }

        // DNS resolution is unavailable in unit tests — skip the resolved-IP check there.
        if (app()->runningUnitTests()) {
            return;
        }

        $ip = gethostbyname($host);

        // gethostbyname() returns the input unchanged when resolution fails.
        if ($ip === $host) {
            $fail('Could not resolve that domain. Check the URL and try again.');

            return;
        }

        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            Log::warning('Blocked instance URL resolving to private/reserved IP', ['host' => $host, 'ip' => $ip]);
            $fail('The :attribute is not allowed.');
        }
    }
}
