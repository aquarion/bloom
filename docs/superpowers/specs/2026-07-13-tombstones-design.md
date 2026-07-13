# Tombstones Design

**Date:** 2026-07-13
**Issue:** #157 — "Tombstones"

## Problem

Inactive accounts accumulate indefinitely today: stale passkeys, dead social-account tokens, and orphaned data with no lifecycle. There's no `last_active_at` tracking at all, no scheduled jobs of any kind, and no path for a user to reclaim an account they've abandoned and later want back.

## Goal

After 83 days of inactivity, warn the user by email. After 90 days, archive ("tombstone") the account: strip it down to an inert record, cancel any subscription, and delete the live `User` row. If the original owner later attempts to log in or recover the account, show them an "this account was archived" screen with the choice to permanently delete it or resurrect it as a fresh account.

## Scope

- **In scope:** activity tracking, the two scheduled commands (warn / tombstone), tombstone data model, login/recovery detection of tombstoned accounts, the archived-account interstitial with delete/resurrect actions.
- **Out of scope:** actual billing integration. This project has no payment/subscription system yet. `User::cancelSubscription()` and `User::isSubscribed()` are added as placeholder hooks (no-op today) for when billing exists.
- **Out of scope:** restoring live social-account connections on resurrection. Per the issue, resurrected accounts must reauth their feeds — archived social-account metadata (provider/handle) may be shown as a "reconnect these" hint, but no tokens are restored (they're not even kept — see Data Model).

## Data Model

### `users` table additions
- `last_active_at` (nullable timestamp) — stamped on successful passkey login and on initial passkey registration.
- `inactivity_warning_sent_at` (nullable timestamp) — set when the 83-day warning email is sent; **reset to `null`** whenever `last_active_at` updates, so a user who returns and later goes inactive again gets warned a second time.

### `User` model additions
- `cancelSubscription(): void` — no-op placeholder, doc-blocked as a future billing hook.
- `isSubscribed(): bool` — no-op placeholder, returns `false`.

### `tombstones` table (new `Tombstone` model)
- `id`
- `email` (unique, indexed — required for the recovery-path lookup)
- `name`
- `archived_passkeys` (JSON array of `{credential_id, public_key, sign_count, transports, name}` — enough to run real WebAuthn verification against later)
- `archived_social_accounts` (JSON array of `{provider, handle, instance_url}` — **access/refresh tokens are dropped, not archived**; keeping live credentials in cold storage is a needless liability and they're likely stale/revoked by the time anyone resurrects)
- `original_user_id` (nullable, unconstrained int — a breadcrumb for support/debugging only, not a real FK since the user row is gone by the time this is set)
- `tombstoned_at`
- `created_at` / `updated_at`

### `tombstone_recovery_tokens` table (new `TombstoneRecoveryToken` model)
Mirrors the existing `passkey_recovery_tokens` table: hashed `token`, `tombstone_id` (FK, cascade delete), `used_at`, `created_at`. Used only by the email-recovery path.

## Scheduled Jobs

Both registered in `routes/console.php` via `Schedule::command(...)->daily()`. This is the first scheduled work in the project — **deployment needs a cron entry running `php artisan schedule:run` every minute**, which doesn't exist yet. Flagging as an explicit deploy checklist item.

The 83/90-day thresholds are config values, not magic numbers, following the existing pattern in `config/feed.php`:

```php
// config/inactivity.php
return [
    'warning_after_days' => env('INACTIVITY_WARNING_DAYS', 83),
    'tombstone_after_days' => env('INACTIVITY_TOMBSTONE_DAYS', 90),
];
```

### `accounts:warn-inactive`
- Selects users where `last_active_at` is between `tombstone_after_days` and `warning_after_days` ago, and `inactivity_warning_sent_at` is still `null`.
- Sends `InactivityWarning` mailable (`mail.inactivity-warning`), then stamps `inactivity_warning_sent_at`.

### `accounts:tombstone-inactive`
- Selects users where `last_active_at <= now()->subDays(config('inactivity.tombstone_after_days'))`.
- Per user, inside a DB transaction (one transaction **per user**, not for the whole batch — a single failure is logged and skipped rather than blocking the run):
  1. Build `archived_passkeys` from the user's `passkeys` relation.
  2. Build `archived_social_accounts` from `socialAccounts` (metadata only, no tokens).
  3. Call `$user->cancelSubscription()`.
  4. Create the `Tombstone` row.
  5. Send `AccountTombstoned` mailable (`mail.account-tombstoned`) to the plain email string (not tied to the `User` model, since it's about to be deleted).
  6. Delete the `User` row. Passkeys, social accounts, and passkey recovery tokens cascade-delete automatically — the existing FK constraints already have `cascadeOnDelete()`.

## Login-Path Detection

In `PasskeyAuthController::resolveVerifiedPasskey()`, when the live `Passkey::where('credential_id', ...)` lookup misses, fall back to searching `Tombstone::archived_passkeys` for a matching `credential_id` via `whereJsonContains('archived_passkeys', ['credential_id' => $credentialId])`. Verify SQLite (the test DB driver) supports this JSON containment query the same way as MySQL/Postgres in production; if it's flaky across drivers, fall back to a PHP-side scan (acceptable at Bloom's scale — tombstone volume is inherently small and this path only runs on a failed live lookup).

On a match, build an **unsaved, transient `Passkey` instance** from the archived fields and pass it straight into the existing `WebAuthnService::verifyAuthentication()` unchanged — that method only reads properties off the model and never persists it, so no changes to `WebAuthnService` are needed.

- **Verification succeeds** → genuine owner. Stash `session(['tombstone_id' => $tombstone->id])` and redirect to `/account/archived` instead of `Auth::login()` (there's no live user to log into).
- **Verification fails** → identical generic "Passkey verification failed" response as any other bad attempt. A leaked/observed `credential_id` alone must not be able to confirm tombstone existence.

## Recovery-Path Detection

`PasskeyRecoveryController::store()` currently looks up `User::where('email', ...)` and always returns the same redirect regardless of whether a user was found (anti-enumeration). Extend this:

- Alongside the `User` lookup, also check `Tombstone::where('email', ...)`.
- If a `Tombstone` matches instead of a live `User`, create a `TombstoneRecoveryToken` (mirrors `PasskeyRecoveryToken`) and send a recovery-style email pointing at the same `setup()` route.
- **Both branches converge on the identical `redirect()->route('passkey.recover.sent')` response.** The HTTP response an unauthenticated prober sees never differs between "no account," "live account," and "tombstoned account." (The *email content* itself naturally differs — "set up your passkey" vs. "your account was archived" — but that's fine, since enumeration only cares about what's observable without inbox access.)

In `setup()`, branch on which token type was consumed:
- `PasskeyRecoveryToken` → today's behavior unchanged (`Auth::login($user)` → passkey setup).
- `TombstoneRecoveryToken` → consume it, stash `session(['tombstone_id' => ...])`, redirect to `/account/archived`.

## Archived-Account Interstitial (`TombstoneController`)

- `show()` — Inertia page (`auth/tombstone`) reading `session('tombstone_id')`. No session value → redirect to login. Renders the archived message with **Delete Entirely** / **Resurrect** actions.
- `destroy()` — hard-deletes the `Tombstone` row (cascades its recovery tokens). Mirrors the existing `ProfileController::destroy` pattern.
- `resurrect()` — creates a **brand-new** `User` row (new id, restored `email`/`name`), re-adds the one passkey that was just cryptographically verified as a live `Passkey`, does not restore any social-account tokens, deletes the `Tombstone`, then `Auth::login($newUser)` and redirects to the feed with a "welcome back — reconnect your accounts" notice.

Routes: `tombstone.show`, `tombstone.destroy`, `tombstone.resurrect`, mounted under `/account/archived`.

## Testing Plan

- **`accounts:warn-inactive`** — sends only within the 83–90 day window; doesn't resend once `inactivity_warning_sent_at` is set; boundary days (exactly 83, exactly 90) behave correctly; a user who logs in between warning and tombstoning drops out of the query and has their warning flag cleared.
- **`accounts:tombstone-inactive`** — archives passkeys/social accounts correctly; confirms access/refresh tokens are *not* archived; calls `cancelSubscription()`; sends the final notice; deletes the user; confirms cascade-delete cleaned up passkeys, social accounts, and recovery tokens.
- **`PasskeyAuthController`** — tombstoned credential with a valid signature redirects to the interstitial; tombstoned credential with an invalid signature gets the identical generic failure as a normal bad attempt (no enumeration leak).
- **`PasskeyRecoveryController`** — tombstoned email produces an HTTP response identical to an unknown/live email; `setup()` correctly branches on token type.
- **`TombstoneController`** — `show`/`destroy`/`resurrect` happy paths, plus rejecting access when there's no `tombstone_id` in session.

## Files to Change

- `database/migrations/2026_07_13_*_add_activity_tracking_to_users_table.php` — new
- `database/migrations/2026_07_13_*_create_tombstones_table.php` — new
- `database/migrations/2026_07_13_*_create_tombstone_recovery_tokens_table.php` — new
- `app/Models/User.php` — `last_active_at`, `cancelSubscription()`, `isSubscribed()`
- `app/Models/Tombstone.php` — new
- `app/Models/TombstoneRecoveryToken.php` — new
- `app/Console/Commands/WarnInactiveAccounts.php` — new
- `app/Console/Commands/TombstoneInactiveAccounts.php` — new
- `config/inactivity.php` — new
- `app/Mail/InactivityWarning.php` — new
- `app/Mail/AccountTombstoned.php` — new
- `resources/views/mail/inactivity-warning.blade.php` — new
- `resources/views/mail/account-tombstoned.blade.php` — new
- `app/Http/Controllers/Auth/PasskeyAuthController.php` — tombstone fallback lookup + verification
- `app/Http/Controllers/Auth/PasskeyRecoveryController.php` — tombstone lookup, token-type branching
- `app/Http/Controllers/Auth/TombstoneController.php` — new
- `resources/js/pages/auth/tombstone.tsx` — new
- `routes/console.php` — schedule both commands
- `routes/auth.php` (or equivalent) — `tombstone.*` routes
- Corresponding test files under `tests/Feature/` and `tests/Unit/`
