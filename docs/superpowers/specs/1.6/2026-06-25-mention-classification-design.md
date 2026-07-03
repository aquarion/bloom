# Mention Classification ("Inline" vs "Chip") — Design Spec

**Date:** 2026-06-25
**Issue:** #141 ("Pigs & Chickens")
**Follow-up:** #143 (avatar-only overflow fallback, deferred)

## Overview

Mastodon and Bluesky posts can carry `@mentions` of other accounts. Today, every mention simply survives as plain inline text in the post body — there's no classification, no extraction, and Bluesky mentions aren't even parsed from structured data (the normalizer never reads `record.facets`).

This feature classifies each mention as either:
- **inline** — stays in the post body text, preserving the post's original flow (analogous to a RACI "Responsible/Accountable" party — directly addressed).
- **chip** — stripped from the body text and shown instead as a small author chip at the bottom of the post (analogous to RACI "Consulted/Informed" — incidentally notified).

No internal naming may reference "pig" or "chicken" (the issue's own analogy, sourced from a breakfast-sandwich RACI mnemonic) — see Naming below.

Gated behind the existing `beta_tester` role (`Gate::define('beta_tester', ...)` in `AppServiceProvider.php:53`). When disabled for a viewer, behavior is byte-for-byte identical to today: mentions stay inline, untouched.

## Naming

- Mention "role": `inline` | `chip`.
- New Post field: `chip_mentions: Mention[]`.
- New backend class: `App\Services\Feed\MentionClassifier`.

## Data model

`Post` (and `reply_to` / `quoted_post`, which receive the same treatment) gains:

```ts
chip_mentions: Mention[];   // empty array if none, or if beta-gated off for this viewer
```

```ts
type Mention = {
  handle: string;
  display_name: string;
  avatar: string;        // '' if unresolved — AuthorChip already falls back to the Bloom logo
  profile_url: string;
};
```

Inline mentions need no new field — they remain exactly where they are in `body`, untouched.

## Classification algorithm

Implemented in `App\Services\Feed\MentionClassifier`, given an ordered list of detected mentions (with position info) plus the "origin" handle(s) to compare against — the reply/quote parent author's handle, when the post is a reply or quote-boost.

1. Identify the **leading run**: mentions starting at position 0, separated only by whitespace, before any other real content.
2. Identify the **trailing run**: mirror, at the end of the text.
3. **Default: every mention is `inline`.**
4. Trailing run, any size → all become `chip`.
5. Leading run, size == 1 → `chip` if it matches the origin's handle, else stays `inline` (default).
6. Leading run, size > 1 → the one mention matching the origin's handle (if any) stays `inline` (anchors "who this is addressed to"); every other mention in that run becomes `chip`. If none match the origin, all become `chip`.
7. Mid-text mentions (not part of either run) → always `inline`, no exceptions.

"Origin" = `reply_to.author_handle` if the post is a reply, or `quoted_post.author_handle` if it's a quote-boost with added commentary. If neither applies, there is no origin and rule 5/6's exception never fires (leading mentions just stay `inline` by default).

### Detection mechanics differ by platform

- **Bluesky**: use `record.facets` (`app.bsky.richtext.facet#mention`) for exact `byteStart`/`byteEnd` offsets and the mentioned `did`. Byte-precise, so leading/trailing-run detection is exact.
- **Mastodon**: no offsets are provided by the API. Use the status's `mentions` array (`username`/`acct`/`url`) for identity — more reliable than scraping HTML `class="mention"` anchors — cross-referenced with regex-located `@token` positions in the plain-text body (post `strip_tags`, pre hashtag/URL stripping, i.e. the same text `extractBody()` already produces before its `stripHashtags`/`stripUrls` calls).

Both `PostNormalizer::fromMastodon()` and `::fromBluesky()` call into `MentionClassifier`, as do the `mastodonReplyTo()`/`mastodonQuotedPost()`/`blueskyReplyTo()`/`blueskyQuotedPost()` helpers (since the same rules apply to those embedded bodies).

## Avatar resolution

- **Bluesky**: extend the existing batched `getProfiles` pattern already used for banner enrichment (`BlueskyFeedService::enrichWithBanners()`, lines 49-100) to also resolve `chip`-mention DIDs — same chunked-25, 24h-cached approach, just fetching avatar/displayName alongside what's already fetched per DID.
- **Mastodon**: new per-`acct` lookup via `GET /api/v1/accounts/lookup?acct={acct}` against the user's home instance API (which transparently resolves remote/federated accounts via webfinger), 24h cache keyed by `acct`, mirroring Bluesky's TTL. On failure (remote instance down, rate-limited, account gone/suspended), cache an empty result and fall back to `avatar: ''` — `AuthorChip` already renders that as the Bloom placeholder logo. Caching the failure (not just successes) prevents repeated re-fetch attempts against the same broken/remote account within the TTL window.

## Beta gating

`FeedController` checks `auth()->user()->hasRole(Role::BetaTester)` and threads that through to the normalizer call as a flag (e.g. `$mentionsEnabled`). When disabled, `MentionClassifier` is never invoked — `body` is built exactly as today, and `chip_mentions` is always present as `[]` for frontend type-safety regardless of beta status.

Since the feed cache (`Cache::tags(["user:{$account->user_id}"])`) is already scoped per Bloom user (not shared across users), baking this gating decision into the normalizer's output at fetch-time is safe — it can't leak a beta user's stripped body into a non-beta user's cache or vice versa.

## Frontend rendering

New component: `resources/js/components/feed/MentionChips.tsx`. Single responsibility: render a row of full `AuthorChip`-style chips (avatar + name + handle, no timestamp) for a `Mention[]` array, each linking to `profile_url` in a new tab (`target="_blank" rel="noopener noreferrer"`, matching the existing pattern in `Attribution.tsx`). Uses `flex-wrap` so the row wraps to a new line if needed — no JS measurement, no avatar-only fallback (deferred to #143). Renders `null` when `chip_mentions` is empty.

Placement:
- Main post: rendered inside `PostAnimator.tsx`, appended after the body text, fed `post.chip_mentions`. Lives in its own component file rather than growing `PostAnimator.tsx` (already 500+ lines) further, though it follows that file's existing `AuthorChip` import pattern (used there for inline reply/quote mini-cards).
- `reply_to` / `quoted_post` mini-cards (also rendered inside `PostAnimator.tsx`, around lines 420/467): same component, fed `post.reply_to.chip_mentions` / `post.quoted_post.chip_mentions`.

No changes needed to `feed.tsx`'s chrome layer — this is part of the post's visible content, not the chrome overlay.

## Testing

- **Backend**: new `tests/Unit/Feed/MentionClassifierTest.php` covering the full rule set — single leading mention (origin match → chip, no match → inline), leading run >1 (origin member stays inline, rest chip; no origin member → all chip), trailing run any size → all chip, mid-text → always inline. Plus `PostNormalizerTest` cases confirming `chip_mentions` is correctly populated/empty for both Mastodon and Bluesky fixtures, and that beta-gating off reproduces today's exact behavior (empty `chip_mentions`, untouched body).
- **Frontend**: light component test for `MentionChips.tsx` (renders with N mentions; renders `null` when empty), following the one existing component-test precedent (`InstanceCombobox.test.tsx`) — not a full page-level test, since no such convention exists yet for `PostAnimator`/`PostContent`.

## Out of scope (deferred)

- Avatar-only overflow fallback when the chip row is space-constrained — tracked as #143.
- Hashtag chip rendering (issue #110) — unrelated, not built preemptively here even though it would share some visual DNA with `MentionChips`.
