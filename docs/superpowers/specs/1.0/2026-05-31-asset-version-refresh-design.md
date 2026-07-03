# Asset Version Refresh Design

**Date:** 2026-05-31
**Status:** Approved

## Overview

Force a full page reload when the deployed app version changes, so users don't navigate with stale JS/CSS assets or a stale app version.

## How Inertia Versioning Works

On every XHR navigation (link click, form submit), Inertia sends the version string it received on the last full page load as the `X-Inertia-Version` header. The server checks this against the current `version()` return value. If they differ, the server responds with `409 Conflict` and Inertia triggers a full browser reload.

This means:
- No polling required.
- No frontend changes required.
- Works automatically for all Inertia navigations.
- Does **not** affect stale idle tabs (that is out of scope).

## Change

Override `version()` in `App\Http\Middleware\HandleInertiaRequests` to return an MD5 hash of the Vite manifest hash (from `parent::version()`) concatenated with `APP_VERSION` (from `config('version.version')`).

```php
public function version(Request $request): ?string
{
    return md5(parent::version($request) . config('version.version'));
}
```

Either value can be `null` without breaking anything — the concatenated string still changes when either component is introduced or changes.

## What Triggers a Refresh

| Scenario | Triggers reload? |
|---|---|
| New Vite build deployed (assets change) | Yes — Vite manifest hash changes |
| `APP_VERSION` bumped (e.g. `1.2.3` → `1.3.0`) | Yes — version string changes |
| Neither changes | No |

## Testing

A feature test asserts that when the `X-Inertia-Version` header on an XHR request doesn't match the current version, the server responds with `409 Conflict`. This is covered by sending an Inertia request with a stale version header and asserting the response status.
