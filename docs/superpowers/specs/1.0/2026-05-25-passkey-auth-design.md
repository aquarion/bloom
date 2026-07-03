# Passkey Authentication — Design Spec

**Date:** 2026-05-25
**Issue:** #1
**Status:** Approved

## Overview

Add WebAuthn/passkey support alongside existing password login. Users can register multiple named passkeys, log in without typing a password (via browser conditional UI or an explicit button), and manage passkeys from the security settings page.

---

## Database

New `passkeys` table:

| Column | Type | Notes |
|---|---|---|
| `id` | `ulid` | primary key |
| `user_id` | `foreignId` | `onDelete('cascade')` |
| `name` | `string` | user-provided label (e.g. "iPhone 15") |
| `credential_id` | `string` | base64-encoded WebAuthn credential ID |
| `public_key` | `text` | COSE-encoded public key |
| `sign_count` | `unsignedBigInteger` | replay-attack counter |
| `transports` | `json`, nullable | e.g. `["internal","hybrid"]` |
| `last_used_at` | `timestamp`, nullable | |
| `created_at` / `updated_at` | timestamps | |

`User` gains `hasMany(Passkey::class)`. `Passkey` belongs to `User`.

---

## Backend Architecture

**Library:** `web-auth/webauthn-lib` — handles all CBOR/COSE encoding, attestation, and assertion verification. Controllers follow the existing Fortify + Inertia pattern.

### WebAuthnService

A thin service class wraps library setup (RP entity, supported algorithms, origin) so neither controller repeats configuration boilerplate.

### PasskeyController (authenticated)

Routes under `settings/`:

- `GET /settings/passkeys/register/options` — generates a registration challenge, stores it in session, returns `PublicKeyCredentialCreationOptions` JSON
- `POST /settings/passkeys/register` — verifies the credential response, stores the passkey with the user-supplied name
- `DELETE /settings/passkeys/{passkey}` — removes a passkey (scoped to `auth()->user()`), dispatches `PasskeyInvalidated` mailable

### PasskeyAuthController (guest)

Routes under `auth/`:

- `GET /auth/passkey/options` — generates an authentication challenge (usernameless: no `allowCredentials` list), stores it in session
- `POST /auth/passkey/authenticate` — verifies assertion, finds matching passkey by credential ID, logs in user via `Auth::login()`, updates `sign_count` and `last_used_at`

### Challenge Storage

WebAuthn challenges are stored in the Laravel session between the options and verify requests. Challenges are consumed (deleted) on use.

---

## Frontend

### Login Page

- On mount: fetch challenge from `/auth/passkey/options`, start `navigator.credentials.get({ mediation: "conditional" })` in the background
- Email input gets `autocomplete="username webauthn"` — browser surfaces passkey suggestions in the autofill dropdown
- If user selects a passkey from autofill → automatic login, no button needed
- If user types a password → `AbortController` cancels the pending conditional request
- A "Sign in with passkey" button triggers the same flow explicitly with `mediation: "optional"`
- If `window.PublicKeyCredential` is undefined → button is hidden, conditional flow not started

### Security Settings Page

New "Passkeys" section (alongside password and 2FA):

- Lists registered passkeys: name, last used date, delete button
- "Add passkey" button → prompts for a name (inline input or small dialog) → runs registration ceremony → list refreshes via Inertia on success

### Registration Flow

After standard Fortify registration succeeds, redirect to `/register/passkey` — a page offering "Set up a passkey" or "Skip for now". Both paths lead to `/dashboard`. The registration form itself is unchanged.

### usePasskey Hook

Encapsulates `navigator.credentials` calls, challenge fetching, `AbortController` management, and error handling. Exposes:

- `startConditional()` — called on login page mount
- `authenticate()` — called by the explicit button
- `register(name)` — called from security settings

---

## Email Notifications

A `PasskeyInvalidated` mailable is sent to the user whenever a passkey is removed, whether automatically or manually. It uses existing Laravel mail infrastructure.

- **Manual deletion** (user clicked delete in settings): "A passkey named '{name}' was removed from your account."
- **Automatic invalidation** (sign_count regression / replay attack detected): "A passkey on your account was automatically disabled due to a potential security issue. If this wasn't you, please contact support."

---

## Error Handling

| Scenario | Handling |
|---|---|
| Browser doesn't support WebAuthn | Hide button; don't start conditional flow |
| User cancels biometric prompt | Catch `NotAllowedError`, show dismissible toast |
| Credential not found / signature mismatch | 422 from server, display error near button |
| `sign_count` regression (replay attack) | Reject login, delete passkey, send security alert email |
| Registration: credential ID already exists | 422 with "this passkey is already registered" |
| Session challenge expired/missing | 422 with "please try again" |
| User manually deletes a passkey | Send confirmation email |

---

## Testing

### Feature Tests (Pest)

- Registration options endpoint returns valid challenge shape and stores challenge in session
- Registration verify endpoint stores passkey and associates it with the user
- Registration rejects a duplicate credential ID
- Authentication options endpoint returns a challenge
- Authentication verify endpoint logs in the correct user and updates `sign_count` and `last_used_at`
- Authentication rejects a bad assertion (mismatched signature)
- Authentication rejects a replayed assertion (`sign_count` regression), deletes passkey, sends email
- Passkey delete endpoint removes the passkey and sends the email
- Passkey delete is scoped — user cannot delete another user's passkey
- `PasskeyInvalidated` mailable renders correctly for both automatic and manual reasons
- Post-registration passkey setup page renders; "skip" redirects to dashboard

### Unit Tests

- `WebAuthnService` returns correctly configured RP entity and supported algorithms

### Frontend

The WebAuthn browser APIs are not unit-testable without heavy mocking. Happy-path coverage comes from feature tests against the API endpoints. The `usePasskey` hook is exercised via manual browser testing.
