<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePasskeyExists
{
    private const EXCLUDED_ROUTES = [
        'passkey.setup',
        'passkey.register.options',
        'passkey.register.store',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        if ($request->route()->named(...self::EXCLUDED_ROUTES)) {
            return $next($request);
        }

        if ($request->user()?->passkeys()->doesntExist()) {
            return redirect()->route('passkey.setup');
        }

        return $next($request);
    }
}
