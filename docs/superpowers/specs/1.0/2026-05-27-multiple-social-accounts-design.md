# Multiple Social Accounts Per User

**Issue:** #2
**Date:** 2026-05-27
**Status:** Design approved

---

## Overview

Allow users to connect more than one social account per provider (e.g. two Mastodon instances, or a personal and work Bluesky account). Feed aggregation already supports multiple accounts — the main work is unblocking the database constraint, updating controllers and routes, and reworking the connections UI.

Also folds in narrow AT Protocol PDS URL support for Bluesky (custom PDS for self-hosters), since it fits naturally into the schema and controller changes.

---

## Data Layer

### Migration

Drop the existing `unique(['user_id', 'provider'])` constraint on `social_accounts` and replace it with:

- `unique(['user_id', 'provider', 'instance_url', 'handle'])` — covers both providers:
  - Mastodon: `(user_id, mastodon, https://mastodon.social, @alice)` is unique; same handle on different instances is allowed; same instance, different handles is allowed.
  - Bluesky: `(user_id, bluesky, https://bsky.social, @alice.bsky.social)` is unique.

`instance_url` is used for the Bluesky PDS URL (defaulting to `https://bsky.social`), making it consistently populated for both providers. MySQL treats `NULL != NULL` in unique indexes so a nullable column cannot be used as a uniqueness discriminator — storing the PDS URL here avoids that issue and removes the need for a separate column. Make `instance_url` non-nullable with a migration that backfills existing Bluesky rows with `https://bsky.social` before altering the column.

### Schema addition

Add a nullable `auth_failed_at` timestamp column to `social_accounts`. Set when token refresh fails with a non-retryable error (expired refresh token, revoked app password). Cleared on successful token refresh or reconnect.

### `connections` route data

Include `id` and `auth_failed_at` in the selected fields passed to the connections page (currently omits both). `id` is required for targeted disconnect; `auth_failed_at` drives the UI warning.

---

## Backend

### `BlueskyAuthService`

- `createSession(string $identifier, string $appPassword, string $pdsUrl = 'https://bsky.social')` — uses `$pdsUrl` as the base for `com.atproto.server.createSession`.
- `refreshSession(string $refreshToken, string $pdsUrl = 'https://bsky.social')` — uses `$pdsUrl` for `com.atproto.server.refreshSession`.
- Both methods default to `https://bsky.social` but accept any PDS base URL.

### `BlueskyFeedService`

- `app.bsky.*` calls (timeline, profiles/banners) stay hardcoded to `https://bsky.social/xrpc` — this is the AppView and is correct for all AT Protocol users on the Bluesky network.
- The internal `request()` method passes `$account->instance_url ?? 'https://bsky.social'` when calling `refreshSession`.
- When `refreshSession` throws a non-retryable auth error (expired/revoked session), set `auth_failed_at = now()` on the account and re-throw so `FeedAggregator` can skip it. Clear `auth_failed_at` on successful refresh.

### `MastodonFeedService`

- Mastodon OAuth tokens have no refresh mechanism — a 401 response means the token is revoked and the account needs reconnecting.
- `fetchTimeline()` should detect a 401 response, set `auth_failed_at = now()` on the account, and re-throw so `FeedAggregator` can skip it. Other error codes (network errors, 5xx) should not set `auth_failed_at` — they are transient.
- Clear `auth_failed_at` on a successful timeline fetch (in case it was set during a previous outage that misidentified a transient 401).

### `BlueskyController`

- `store()`: replace `updateOrCreate(['user_id', 'provider'])` with a duplicate check then `create()`. If `(user_id, bluesky, instance_url, handle)` already exists, redirect back with status `bluesky-already-connected`. Saves `instance_url` (the PDS URL from form input, defaulting to `https://bsky.social`).
- `destroy(Request $request, SocialAccount $account)`: route-model-bound. Verify `$account->user_id === $request->user()->id` (403 otherwise). Deletes only the specified account.

### `MastodonController`

- `callback()`: replace `updateOrCreate(['user_id', 'provider'])` with a duplicate check then `create()`. If `(user_id, mastodon, instance_url, handle)` already exists, redirect back with status `mastodon-already-connected`.
- `destroy(Request $request, SocialAccount $account)`: same route-model-bound pattern as Bluesky.

### Routes

```
DELETE /auth/mastodon/{account}   → mastodon.destroy
DELETE /auth/bluesky/{account}    → bluesky.destroy
```

The `{account}` segment uses Laravel route model binding on `SocialAccount`. No other route changes.

---

## Frontend

### `SocialConnection` interface

Add `id: number` and `auth_failed_at: string | null` fields. `instance_url` already exists; for Bluesky it will now always be populated (the PDS URL).

### Connections page layout

Each provider panel shows:

1. **List of connected accounts** — each row shows the handle (and instance URL for Mastodon) with an individual Disconnect button whose form action targets `/auth/{provider}/{id}`. If `auth_failed_at` is set, the row shows a warning ("Needs reconnecting — credentials have expired") in place of the handle details.
2. **Always-visible add form** below the list — same fields as today. Bluesky form gains an optional "PDS URL" field (placeholder `https://bsky.social`).

```
┌─ Mastodon ────────────────────────────────────────┐
│  @alice@mastodon.social              [Disconnect]  │
│  @bob@fosstodon.org                  [Disconnect]  │
│                                                    │
│  Add another Mastodon account                      │
│  Instance URL [_________________________]          │
│  [Connect Mastodon]                                │
└────────────────────────────────────────────────────┘

┌─ Bluesky ─────────────────────────────────────────┐
│  @alice.bsky.social                  [Disconnect]  │
│                                                    │
│  Add another Bluesky account                       │
│  Handle      [_________________________]           │
│  App Password[_________________________]           │
│  PDS URL     [_________________________] (optional, defaults to bsky.social)│
│  [Connect Bluesky]                                 │
└────────────────────────────────────────────────────┘
```

### Status messages

Add handling for `mastodon-already-connected` and `bluesky-already-connected` status values (shown as informational rather than success).

---

## Testing

### Dusk (`tests/Browser/ConnectionsTest.php`) — new file

Covers display and disconnect flows. Connect flows (which require HTTP mocking) remain in feature tests.

- Connections page loads for an authenticated user; Mastodon and Bluesky sections visible
- Pre-seeded Mastodon account: handle displayed, disconnect button present
- Pre-seeded Bluesky account: handle displayed, disconnect button present
- Multiple Mastodon accounts: all handles visible simultaneously
- Multiple Bluesky accounts: all handles visible simultaneously
- Disconnect a specific Mastodon account: that account removed, others remain
- Disconnect a specific Bluesky account: that account removed, others remain
- Account with `auth_failed_at` set: warning message visible on connections page

### Feature tests — additions to existing files

**`BlueskyControllerTest`:**
- Adding a second Bluesky account with a different handle succeeds (201/redirect with `bluesky-connected`)
- Adding a duplicate handle returns redirect with `bluesky-already-connected`
- Disconnect by account ID removes only that account
- Attempting to disconnect another user's account returns 403
- `instance_url` (PDS URL) is saved when provided; defaults to `https://bsky.social` when omitted

**`BlueskyAuthTest`:**
- `createSession` uses provided `pdsUrl` as base URL
- `refreshSession` uses provided `pdsUrl` as base URL

**`BlueskyFeedServiceTest`:**
- Non-retryable auth failure during refresh sets `auth_failed_at` on the account
- Successful token refresh clears `auth_failed_at` if previously set

**`MastodonFeedServiceTest`:**
- 401 response from timeline API sets `auth_failed_at` on the account
- Successful timeline fetch clears `auth_failed_at` if previously set
- Non-401 errors (5xx, network timeout) do not set `auth_failed_at`

**`MastodonControllerTest`:**
- Adding a second Mastodon account on a different instance succeeds
- Adding the same handle on the same instance returns `mastodon-already-connected`
- Adding the same handle on a different instance succeeds
- Disconnect by account ID removes only that account
- Attempting to disconnect another user's account returns 403

### No changes needed

`FeedAggregator` — already iterates all `socialAccounts` and handles per-account cursors. Existing tests cover it.

---

## Out of Scope

- Renaming the `bluesky` provider enum value to `atproto` — cosmetic, high churn, separate issue if wanted.
- Full AppView configurability (custom `app.bsky.*` endpoint) — separate issue.
- Custom account labels/names — handle is sufficient as identifier.
- In-place re-authentication (updating tokens for an existing account without disconnecting) — tracked in issue #40.
- Dusk tests for connect form submission (requires HTTP mocking from browser process) — feature tests cover this.
