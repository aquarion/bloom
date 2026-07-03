# Public Feeds & Hashtag Links — Design

**Issues:** #117 (public Mastodon feeds), #118 (Bluesky feeds), #110 (hashtag interactivity)
**Milestone:** 1.6 — Public Feeds & Hashtags
**Date:** 2026-06-27

---

## Overview

Three related features that expand how feed sources are added and how hashtags behave:

1. **Public Mastodon feeds** — follow any Mastodon instance's public timeline without a personal account
2. **Bluesky feeds** — subscribe to a Bluesky algorithmic/curated feed (separate from home timeline)
3. **Hashtag links** — make hashtag pills link out to the source platform instead of being decorative

---

## Data Model

### Migration: `add_feed_type_to_social_accounts`

Add a `feed_type` string column to `social_accounts`, defaulting to `'home'`. Also alter `access_token` and `handle` to be nullable (currently non-nullable), since public feed rows carry neither.

| `feed_type` | Meaning |
|---|---|
| `home` | Authenticated home timeline (existing behaviour) |
| `public_mastodon` | Unauthenticated (or fallback-authed) Mastodon public timeline |
| `bluesky_feed` | Bluesky algorithmic feed, authed via a sibling `home` account |

**Public Mastodon rows:** `provider = 'mastodon'`, `feed_type = 'public_mastodon'`, `instance_url = 'https://mastodon.social'`, `access_token = null`, `user_id = <owner>`.

**Bluesky feed rows:** `provider = 'bluesky'`, `feed_type = 'bluesky_feed'`, `feed_settings.feed_uri = 'at://did:plc:.../app.bsky.feed.generator/...'`, `access_token = null`, `user_id = <owner>`. Auth is delegated to the user's `home`-type Bluesky account.

No other schema changes needed. Existing `nullable` columns (`access_token`, `token_secret`, `handle`) accommodate rows without credentials.

---

## Backend

### `MastodonFeedService::getPublicTimeline(string $instanceUrl, int $limit): array`

New method. Mirrors the `getHomeTimeline` head/delta pattern but:

- Hits `/api/v1/timelines/public` without a token
- On 401, falls back to `null` (caller handles auth retry)
- Cache key: `mastodon:public:{host}:head:data` / `mastodon:public:{host}:head:fresh` — **not** tagged by user, so the result is shared app-wide across all users following the same instance
- TTLs: 6h fresh, 7d data (matches welcome controller)

### `FeedAggregator` — new branches

Within the existing `foreach ($user->socialAccounts as $account)` loop, two new `feed_type` branches:

**`public_mastodon`:**
1. Call `MastodonFeedService::getPublicTimeline($account->instance_url, $limit)` without auth
2. On 401 response (service returns `null`), find a `home`-type Mastodon `SocialAccount` for this user on the same instance and retry via `getHomeTimeline`
3. If neither succeeds, log a warning and `continue` (same as existing error handling)
4. Normalize with `PostNormalizer::fromMastodon($status, $host, mentionsEnabled: false)` — public feeds skip mention classification

**`bluesky_feed`:**
1. Find the user's `home`-type Bluesky `SocialAccount` (use the one with the lowest `id` if multiple exist; log+skip if none)
2. Read `$account->getPreference('feed_uri')` for the AT URI
3. Call `BlueskyFeedService::getFeed($authAccount, $feedUri, $limit, $cursor)`
4. Normalize identically to home timeline posts

### `BlueskyFeedService::getFeed(SocialAccount $authAccount, string $feedUri, int $limit, ?string $cursor): array`

New method. Calls `app.bsky.feed.getFeed` with `feed=$feedUri`. Response shape is identical to `getTimeline` (`feed` array + `cursor`), so the same normalization path applies. Cache key: `bluesky:feed:{authAccountId}:{feedUri}:{cursor|head}`, TTL matching `TIMELINE_TTL`.

### `PostNormalizer` — `source_instance` field

Add `source_instance: string|null` to the normalized post shape. For Mastodon posts: the instance hostname (e.g. `mastodon.social`), extracted from `instance_url` or parsed from `author_handle`. For Bluesky: `null` (hashtag links use a fixed `bsky.app` URL).

### `SocialAccount` model

Add `feed_type` to `$fillable`. No other changes needed.

---

## Frontend

### Connections page

**Adding a public Mastodon feed:**
- New form section: "Follow a public Mastodon timeline"
- Input: instance hostname or URL (e.g. `mastodon.social`)
- Submit → `POST /connections/public-mastodon` → `ConnectionsController@storePublicMastodon`
- Controller normalises the URL (strips scheme, trailing slash), creates a `SocialAccount` with `feed_type = 'public_mastodon'`
- The new feed appears in the connections list as a removable entry (same delete flow as existing accounts)

**Adding a Bluesky feed:**
- Under each connected Bluesky account in the connections list, an "Add feed" expander
- Input: a `bsky.app` feed URL (e.g. `https://bsky.app/profile/did:plc:.../feed/whats-hot`)
- Submit → `POST /connections/bluesky-feed` → `ConnectionsController@storeBlueskyFeed`
- Controller extracts the AT URI from the URL, creates a `SocialAccount` row with `feed_type = 'bluesky_feed'` and `feed_settings.feed_uri`
- Appears as a removable sub-entry under the parent Bluesky account

### Hashtag pills — `PostAnimator.tsx`

The hashtag `<span>` (lines 532–543) becomes an `<a>` tag. Link destination:

- Mastodon: `https://{post.source_instance}/tags/{tag}`
- Bluesky: `https://bsky.app/search?q=%23{encodeURIComponent(tag)}`

Attributes: `target="_blank" rel="noopener noreferrer"`. The outer container's `aria-hidden="true"` is removed since the links are now interactive — they must be keyboard-reachable.

### TypeScript types

`Post` interface gains `source_instance: string | null`. `FeedResponse` unchanged.

---

## Error Handling

- **Public Mastodon 401 with no fallback account:** set `auth_failed_at` on the `SocialAccount` row, log warning, `continue`. The connections page already reads `auth_failed_at` to display an "authentication failed" banner — adapt the copy for public feeds to say "this instance requires authentication; connect a Mastodon account on this server to continue." The user can either add a home account for that instance or remove the public feed.
- **Public Mastodon 401 with fallback account:** retry silently with the home account's token. No error state — the feed works, it's just no longer fully public.
- **Bluesky feed with no home account:** log warning, skip. The connections UI prevents creating a Bluesky feed row if the user has no home Bluesky account (button disabled / hidden).
- **Invalid Bluesky feed URL:** validate AT URI format in the controller before saving; return a validation error to the form.

---

## Testing

- `MastodonFeedServiceTest`: `getPublicTimeline` success, 401-without-fallback returns null, caching is not user-tagged
- `BlueskyFeedServiceTest`: `getFeed` constructs correct params, response normalized identically to home timeline
- `FeedAggregatorTest`: public_mastodon branch, bluesky_feed branch, auth fallback path
- `ConnectionsControllerTest`: store public Mastodon feed, store Bluesky feed (valid + invalid URL), delete both types
- Frontend: hashtag `<a>` tags render correct URLs for both platforms; `aria-hidden` removed from container
