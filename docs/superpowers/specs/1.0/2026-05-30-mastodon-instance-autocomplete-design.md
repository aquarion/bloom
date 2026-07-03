# Mastodon Instance Autocomplete

**Issue:** #39
**Date:** 2026-05-30

## Overview

When a user types into the Mastodon instance URL field on the Connected Accounts page, show autocomplete suggestions drawn from the joinmastodon.org public server list. Suggestions display the instance domain and its short description. The user may also type any domain not in the list — free text entry is always allowed.

## Backend

### New route

```
GET /mastodon/instances?q={query}
```

- Protected by the `auth` + `verified` middleware group in `routes/settings.php` (same group as the existing Mastodon routes — unauthenticated requests receive a redirect/401)
- Query parameter `q` is required and must be at least 2 characters; return `[]` for shorter strings
- Handled by a new method `MastodonController::instances(Request $request)`

### Data source

Fetches `https://api.joinmastodon.org/servers` (no auth required). The full list (~326 servers) is cached under the key `mastodon_servers_list` for **24 hours** using Laravel's default cache driver.

### Filtering

After loading from cache, filter in PHP:
- Match entries where `domain` or `description` contains the query string (case-insensitive)
- Return the first 8 matches
- Response shape: `[{ "name": string, "description": string }]` where `name` is the domain and `description` is the short description (trimmed, one line)

### Error handling

If the upstream fetch fails (connection error or non-200 response), return `[]`. The input remains fully functional — autocomplete is a progressive enhancement.

## Frontend

### New component: `InstanceCombobox`

Location: `resources/js/components/InstanceCombobox.tsx`

Replaces the plain `<Input>` for instance URL in `connections.tsx`. Uses `@headlessui/react`'s `Combobox` (already installed).

**Behaviour:**
- Controlled input — the typed value is always the form value, not forced to match a suggestion
- Fetches suggestions via `GET /mastodon/instances?q={value}` debounced 300ms, only when input length ≥ 2
- Dropdown shows up to 8 rows: bold domain on top, small muted description below
- Selecting a suggestion fills the input with the domain only (no `https://` prefix — the backend controller already prepends it)
- If the fetch returns `[]` or errors: dropdown is not shown; input behaves as plain text
- A subtle spinner appears inside the input trailing edge while a fetch is in flight

**Props:**
```ts
interface InstanceComboboxProps {
  id: string;
  name: string;
  placeholder?: string;
}
```

The component is uncontrolled from the form's perspective — it renders a hidden/visible input that Inertia's `<Form>` picks up by `name`, same as the existing `<Input>`.

### Changes to `connections.tsx`

Replace:
```tsx
<Input id="instance_url" name="instance_url" placeholder="https://mastodon.social" />
```
With:
```tsx
<InstanceCombobox id="instance_url" name="instance_url" placeholder="https://mastodon.social" />
```

No other changes to the form or submit flow.

## What does not change

- `MastodonController::redirect()` — validation, `https://` prepend, and OAuth redirect are unchanged
- Form submission flow — unchanged
- No new npm packages required (`@headlessui/react` already present)

## Testing

- **Unit:** `MastodonControllerTest` — add cases for `instances()`: returns filtered results, returns `[]` on short query, returns `[]` on upstream failure, results are cached
- **Frontend:** Vitest + Testing Library — `InstanceCombobox` renders suggestions on input, selecting a suggestion sets the value, no dropdown shown when fetch returns empty
