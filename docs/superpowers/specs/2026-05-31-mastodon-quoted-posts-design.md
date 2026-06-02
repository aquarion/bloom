# Mastodon Quoted Posts — Design

**Date:** 2026-05-31
**Issue:** #29

## Overview

Add quoted post support for Mastodon statuses. Bluesky already renders quoted posts; the frontend `QuotedPost` type and `Attribution` rendering are in place. This change is entirely backend: detect and normalise quoted posts from Mastodon API responses.

## Mastodon Quote Post Formats

Two forms to support, checked in priority order:

1. **Inline embed** — `$source['quote']` is a full status object embedded in the payload (Mastodon 4.3+). Zero extra API calls.
2. **`quote_id` fetch** — `$source['quote_id']` is present but no inline embed. Fetch the status via `getStatus()`, same pattern as reply parents.

`$source` is `$status['reblog'] ?? $status` (the actual post content, unwrapped from boosts).

If neither is present, `quoted_post` remains `null`.

## Changes

### `FeedAggregator`

Rename `fetchMastodonParents` → `fetchMastodonStatuses(SocialAccount $account, array $statuses, callable $idExtractor): array`.

Internals unchanged: check batch by ID first, call `getStatus()` for misses, return `id => status` map.

Call it twice in `fetch()`:

```php
$parents = $this->fetchMastodonStatuses($account, $statuses, fn($s) => $s['in_reply_to_id'] ?? null);
$quotes  = $this->fetchMastodonStatuses($account, $statuses, fn($s) => ($s['reblog'] ?? $s)['quote_id'] ?? null);
```

Pass the resolved quote status into `fromMastodon()`:

```php
$source = $s['reblog'] ?? $s;
$quoteId = $source['quote_id'] ?? null;
$this->normalizer->fromMastodon($s, $host, $parents[…], $account->handle, $quoteId ? ($quotes[$quoteId] ?? null) : null);
```

### `PostNormalizer::fromMastodon()`

Add `?array $quoteStatus = null` as fifth parameter.

Replace `'quoted_post' => null` with `$this->mastodonQuotedPost($source, $host, $quoteStatus)`.

### New `mastodonQuotedPost(array $source, string $host, ?array $quoteStatus): ?array`

```
1. $raw = $source['quote'] ?? $quoteStatus
2. If null → return null
3. Extract account data from $raw['account']
4. Apply federated handle conditional (str_contains($acct, '@') ? "@$acct" : "@$acct@$host")
5. Return QuotedPost shape:
   - author_name, author_handle, author_avatar
   - original_url (safeUrl($raw['url']))
   - body (truncateBody(extractBody($raw['content'])))
   - created_at ($raw['created_at'] ?? null)
```

Output shape is identical to `blueskyQuotedPost` output.

## Testing

### `PostNormalizerTest`

- Inline `quote` field on status → quoted_post populated
- Inline `quote` on reblogged status → quoted_post populated
- `quote_id` path (pre-fetched `$quoteStatus` passed in) → quoted_post populated
- Federated `acct` in quoted post author → handle not double-suffixed
- Neither `quote` nor `quoteStatus` → `quoted_post` is null

### `FeedAggregatorTest`

- Rename existing reply-parent test to reflect new method name
- New test: `quote_id` present → `fetchMastodonStatuses` called and result passed to normalizer

## Out of Scope

- Card-embed quote detection
- Fetching quotes from instances that embed no `quote`/`quote_id` field
- Frontend changes (already handled by existing `QuotedPost` rendering)
