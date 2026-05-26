# Passkey Auth Challenge Cache Fix

## Problem

`PasskeyAuthController::options()` stores the WebAuthn challenge in `session()`. When a user has a `remember_web_*` cookie, `SessionGuard::migrate()` rotates the session ID between the GET `/auth/passkey/options` and POST `/auth/passkey/authenticate` requests, losing the stored challenge and returning "No active challenge."

The registration flow was already fixed by keying cache on user ID (`Cache::tags(['user:{id}'])`). Auth cannot use the same approach because the user is not yet identified when fetching options.

## Solution

Replace session storage with a short-lived cache entry keyed by a random token, passed between requests via the `X-Passkey-Token` HTTP header.

**Flow:**
1. `GET /auth/passkey/options` — generate `$token = Str::random(40)`, store challenge in `Cache::put("passkey_auth:{$token}", serialize($options), 300)`, return token as `X-Passkey-Token` response header.
2. Frontend captures `X-Passkey-Token` from the options response.
3. `POST /auth/passkey/authenticate` — frontend sends `X-Passkey-Token` header; controller reads it, does `Cache::pull("passkey_auth:{$token}")`.

No tags required (token provides the uniqueness). Works with any cache driver (`file`, `array`, `database`).

## Changes

- `app/Http/Controllers/Auth/PasskeyAuthController.php` — token generation + Cache put/pull
- `resources/js/hooks/use-passkey.ts` — `runAuthentication` reads header, sends it back
- `tests/Feature/Auth/PasskeyAuthTest.php` — seed cache instead of session; assert response header
