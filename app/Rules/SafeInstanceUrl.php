<?php

namespace App\Rules;

use App\Contracts\HostResolver;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Log;

/**
 * Rejects a provider instance/PDS URL that isn't a plain HTTPS host, or that resolves
 * (directly as a bare IP, or via DNS) to a private/reserved IP range — guards the
 * connect flows against SSRF to internal services. Consolidates what used to be three
 * near-identical, drifted implementations across BlueskyController, MastodonController,
 * and ConnectionsController.
 *
 * DNS resolution is delegated to the container-bound HostResolver rather than calling
 * gethostbyname() directly, both so a single malicious/multi-homed answer can't slip a
 * private address past validation (every A/AAAA record is checked, not just the first
 * IPv4 one) and so tests can swap in a fake resolver instead of a mutable static — a
 * static would violate this app's Octane rule against request-specific state living in
 * process-lifetime storage (see CLAUDE.md).
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

        $addresses = app(HostResolver::class)->resolve($host);

        if ($addresses === []) {
            $fail('Could not resolve that domain. Check the URL and try again.');

            return;
        }

        foreach ($addresses as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                Log::warning('Blocked instance URL resolving to private/reserved IP', ['host' => $host, 'ip' => $ip]);
                $fail('The :attribute is not allowed.');

                return;
            }
        }
    }
}
