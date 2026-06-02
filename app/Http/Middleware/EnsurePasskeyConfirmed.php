<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasskeyConfirmed
{
    private const TIMEOUT = 300;

    public function handle(Request $request, Closure $next): Response
    {
        if (time() - (int) $request->session()->get('passkey_confirmed_at', 0) > self::TIMEOUT) {
            return back()->withErrors(['passkey' => 'Please confirm your identity to continue.']);
        }

        return $next($request);
    }
}
