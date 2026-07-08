# Boosted Post Age Filter Design

**Date:** 2026-07-08

## Problem

Currently, `FeedAggregator::applyAgeCutoff` exempts all boosted posts from the age filter entirely (`boosted_by !== null → pass through`). This means a boost of a 3-year-old post always appears in the feed regardless of the user's max age setting.

## Goal

Filter boosted posts based on when the boost happened, not (or not only) when the original post was created.

## Design

### Single Change: `applyAgeCutoff` in `FeedAggregator`

Replace the blanket boost exemption with date-aware logic:

1. For a **boosted post**, compare the cutoff against `boosted_by_created_at` (the boost event date). If that field is null, fall back to the post's own `created_at`.
2. For a **non-boosted post**, compare against `created_at` as before.
3. If the resolved date is null, filter the post out (existing behaviour).

`boosted_by_created_at` is already populated by both normalizers:
- Mastodon: `$status['created_at']` (the reblog status timestamp)
- Bluesky: `$reason['indexedAt']` (the repost index timestamp)

No config changes, no new fields, no schema migrations needed.

### Behaviour Summary

| Post type | Date used for cutoff |
|-----------|---------------------|
| Non-boosted | `created_at` |
| Boosted, `boosted_by_created_at` set | `boosted_by_created_at` |
| Boosted, `boosted_by_created_at` null | `created_at` (fallback) |
| Either, date null | filtered out |

## Files to Change

- `app/Services/Feed/FeedAggregator.php` — `applyAgeCutoff` method only
- `tests/Feature/` — update/add tests covering the new boost date logic
