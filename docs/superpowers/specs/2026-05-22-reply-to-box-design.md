# Reply-To Box: Author Identity & Shared AuthorChip

**Date:** 2026-05-22
**Branch:** aquarion/issue20

## Overview

Enrich the reply-to context box shown above reply posts to include the original author's avatar, display name, and a link to the original post. Extract a shared `AuthorChip` component so the reply-to box and the bottom Attribution bar use a consistent visual pattern.

## Changes

### Backend — `PostNormalizer.php`

Extend `mastodonReplyTo()` and `blueskyReplyTo()` to include three additional fields:

- `author_name` — display name (falling back to handle if empty)
- `author_avatar` — avatar URL (run through `safeUrl`)
- `original_url` — link to the original post
  - Mastodon: `$parent['url']`
  - Bluesky: constructed via the existing `blueskyPostUrl()` helper using `$parent['author']['handle']` and `$parent['uri']`

### TypeScript — `resources/js/types/post.ts`

Add to the `ReplyTo` interface:

```ts
author_name: string;
author_avatar: string;
original_url: string;
```

### New component — `resources/js/components/feed/AuthorChip.tsx`

Small, reusable author identity row:

- 28px rounded-full avatar (`h-7 w-7`, matching Attribution)
- Display name: bold, `text-xs`
- Handle: muted, `text-[0.65rem]`
- No link logic — callers wrap it in `<a>` or `<div>` as needed
- Props: `name`, `avatar`, `emojis`, `subtext?: ReactNode` — callers pass either a handle string or richer JSX (e.g. the "Posted X ago" line); no link logic in the component itself

### Updated component — `Attribution.tsx`

Refactor internally to use `AuthorChip` for the avatar + name + handle row. The "Posted X ago · tap to open ↗" subtext remains unchanged beneath it. External API (props) does not change.

### Updated component — `PostAnimator.tsx`

Replace the existing reply-to `<div>` with an `<a>` panel:

- `href={post.reply_to.original_url}`, `target="_blank"`, `rel="noopener noreferrer"`
- Same glass-panel styling (`rounded border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm`)
- `↩` indicator + `AuthorChip` at the top
- Body text below, `line-clamp-3` (up from 2)

## Data Flow

```
Mastodon/Bluesky API
  └─ PostNormalizer::mastodonReplyTo() / blueskyReplyTo()
       └─ reply_to: { author_name, author_handle, author_avatar, original_url, body }
            └─ Post JSON → PostAnimator (reply-to panel) + Attribution (bottom bar)
                              └─ AuthorChip (shared)
```

## Tests — `PostNormalizerTest.php`

Add test cases covering `reply_to` normalisation for both sources:

**Mastodon:**
- Reply with a full parent (account with display name, avatar, url, content) → all five fields present and correct
- Reply where parent account has no display name → `author_name` falls back to `acct`
- Reply where parent `url` is non-http → `original_url` is empty string (safeUrl behaviour)
- `$parentStatus = null` → `reply_to` is `null`

**Bluesky:**
- Reply with a full parent (author with displayName, handle, avatar, uri, record text) → all five fields present and correct
- Reply where parent author has no displayName → `author_name` falls back to handle
- Parent with no `record.text` → `reply_to` is `null`

## Out of Scope

- Mastodon quoted posts — `quoted_post` is hardcoded `null` for Mastodon until instance support is widespread (tracked in #29)
- No changes to emoji handling within the reply-to box body text
