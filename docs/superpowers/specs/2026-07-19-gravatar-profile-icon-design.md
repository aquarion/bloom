# Gravatar Profile Icon — Design

GitHub issue: [#3](https://github.com/aquarion/bloom/issues/3)

## Problem

The Bloom account's own profile icon (shown in the sidebar via `UserInfo`) always
falls back to a placeholder — initials on a neutral background — because
`User::avatar` is never populated. The frontend `User` type already has an
optional `avatar?: string` field (`resources/js/types/auth.ts:5`) and
`UserInfo` already wires it into `<AvatarImage src={user.avatar} />`
(`resources/js/components/user-info.tsx:15`), but nothing on the backend sets
it.

## Goal

Use the user's [Gravatar](https://gravatar.com) image (derived from their
account email) as their profile icon, falling back to the existing initials
placeholder when no Gravatar image exists for that email.

## Approach

Compute the Gravatar URL on the backend as a `User` accessor, so it's just
data by the time it reaches the frontend — no hashing library or URL-building
logic needed in JS, and no duplication if avatars are needed elsewhere later.

### Backend

Add an `avatar` accessor to `app/Models/User.php`:

```
https://www.gravatar.com/avatar/{sha256(strtolower(trim(email)))}?s=128&d=404
```

- **Hash**: SHA256 of the lowercased, trimmed email — Gravatar's current
  standard (the older MD5 scheme still works but is deprecated).
- **`s=128`**: requested at 2x the current render size (`h-8 w-8` = 32px) for
  retina displays; scaled down via CSS as already happens.
- **`d=404`**: no Gravatar-generated default image (e.g. identicon/mp). A
  non-existent image 404s, which lets the frontend's existing fallback UI
  (initials) take over rather than showing a Gravatar-generated default.

Add `avatar` to `User::$appends` so it's included whenever the model
serializes. `HandleInertiaRequests::share()` already exposes
`'user' => $request->user()` as-is, so no middleware change is needed — the
accessor flows through automatically.

### Frontend

No changes needed. `UserInfo` already passes `user.avatar` to `AvatarImage`,
and Radix's `Avatar.Image` (`@radix-ui/react-avatar`, wrapped in
`resources/js/components/ui/avatar.tsx`) already falls back to
`AvatarFallback` (initials) automatically on image load error — a 404
triggers that natively, with no extra `onError` handling required.

### Scope

`UserInfo` (rendered in `app-sidebar-contents.tsx`) is the only place the
Bloom account's own profile icon renders today. Post attributions
(`Attribution.tsx`, `MentionAvatarChip.tsx`, etc.) show separate
Bluesky/Mastodon avatars pulled from those platforms and are unrelated to
this issue. Fixing `UserInfo`'s data source satisfies "throughout the app"
since it's the single shared component for the account's own icon.

### Privacy

Standard Gravatar usage: only an email hash is sent to gravatar.com, never
the raw email address. No opt-in/opt-out setting is being added — Gravatar
lookup is unconditional, matching how most apps use it.

## Testing

- PHP feature/unit test on `User`: given a known email, assert the `avatar`
  accessor produces the expected URL — correct SHA256 hash, `s=128`, `d=404`
  — and that it appears in the model's serialized output (`toArray()` /
  Inertia shared `auth.user` prop).
- No new frontend test: the fallback behavior (`AvatarImage` →
  `AvatarFallback` on error) is Radix's existing, already-relied-upon
  behavior. The only change is what URL is passed in, which is exercised by
  the backend test above.

## Out of scope

- Making Gravatar opt-in/opt-out via a settings toggle.
- Any other avatar surface in the app (social-account/post attribution
  avatars) — those come from Bluesky/Mastodon, not Gravatar.
