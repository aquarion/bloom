# Post View Improvements Design

**Date:** 2026-06-08
**Issues:** #100 (Biggest Word Adaptations), #101 (URL Detection), #102 (Hashtag Display)

---

## Issue #100 — Biggest Word Adaptations

### Problem

The feed highlights and animates the "longest word" in each post. Currently the selection considers all words including `@mentions` and `#hashtags`. These tokens are often long but are not meaningful content words, so selecting one as the focal word produces misleading or visually odd results.

### Design

Before running the longest-word reduce, filter out word elements whose `textContent` starts with `@` or `#`. Use the filtered list for the selection; fall back to the full list if the filtered list is empty (e.g. an all-mention post) so there is always a result.

### Files to Change

- `resources/js/components/feed/PostAnimator.tsx` — line ~296, highlight colour assignment
- `resources/js/lib/animations/templates/arc.ts` — line ~8, arc focal word selection

### No-change scope

- No backend changes.
- No changes to how words are rendered or animated — only which word is *selected* as longest.

---

## Issue #101 — URL Detection for Bare Domains

### Problem

`PostNormalizer.php` detects URLs using `https?://\S+`. Bare domain URLs (e.g. `fosstodon.org/users/foo`, `github.com/aquarion/bloom`) do not have a scheme and are missed. This means they are neither stripped from display text nor extracted for link card generation.

### Design

Add a secondary bare-domain regex alongside the existing scheme-based one:

```
/(?<![.@\w])([a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+\/\S+)/
```

**Why this is safe:**
- Requires the match to start with a letter — rules out version strings like `1.2/path`
- Requires at least one dot-separated segment before the slash — rules out single-word paths
- Requires a `/` followed by non-whitespace — rules out bare hostnames (low signal, high false-positive risk)
- Negative lookbehind `(?<![.@\w])` prevents matching mid-word or email-address fragments

**Normalisation:** When a bare-domain URL is extracted for use as a link (e.g. in `extractFirstLink`), prepend `https://` before passing it to `safeUrl()`.

### Functions to Change

Both functions in `app/Services/Feed/PostNormalizer.php`:

- `stripUrls(string $text)` — extend to also strip bare-domain-with-path matches
- `extractFirstLink(string $text)` — extend to also detect bare-domain URLs; prepend `https://` before normalising

`extractFirstLinkFromHtml` does not need changes — Mastodon wraps links in `<a>` tags with full URLs already.

### Edge Cases

- If a bare-domain URL and a scheme URL both appear, the first one in the string wins (existing behaviour for scheme URLs; same ordering for the combined match).
- Trailing punctuation (`.`, `,`, `!`, `)`) should be stripped from bare-domain matches the same way `rtrim($m[0], '.,;!?)>')` currently handles scheme URLs.

---

## Issue #102 — Hashtag Display

### Problem

Hashtags appear inline in post body text with no special visual treatment. The goal is to surface them as distinct decorative elements without cluttering the attribution bar.

### Design

**Backend — extraction and stripping:**

Extract hashtags from each post before cleaning the body, then strip them from the display text.

- **Mastodon:** read from `$source['tags']` (array of `{name, url}` objects already in the API response); take `name` values
- **Bluesky:** regex `/#([a-zA-Z0-9_]+)/` over the raw text (facets could be used but regex is simpler and sufficient)
- Add `hashtags: string[]` to the normalized post array (lowercase, without `#` prefix)
- In `cleanBody()`, strip `#hashtag` tokens from the text after other processing and collapse any resulting double spaces

**Frontend — layout:**

The hashtag strip is absolutely positioned on the right edge of the post container (`containerRef`, which is already `relative`). It does not affect text centering or line-width measurement.

- A vertical `flex-col` strip, pinned to the right with `absolute right-2 top-0 h-full`
- Each hashtag is a small pill: `#tag` text, `text-[0.6rem]`, semi-transparent white background/border, rounded-full, small padding
- Each pill is rotated 90 degrees (`rotate-90`) so the text reads left-to-right when the strip is viewed from the right side of the screen
- Pills are `items-center justify-center` within the strip; if there are many they shrink via `overflow-hidden` on the strip
- Only rendered when `post.hashtags.length > 0`
- Decorative only — no click handler, no links

**Frontend — type update:**

Add `hashtags: string[]` to the `Post` interface in `resources/js/types/post.ts`.

**Issue filed for interactivity:** Tapping a hashtag to filter the feed or link out to the platform is deferred — file as a follow-up GitHub issue during implementation.

### Interaction with #100

Since hashtags are stripped from the body before `splitIntoLines`, the `@`/`#` filter in the longest-word selection (issue #100) only needs to guard against `@mentions` in practice. Both fixes should still be applied for correctness.

### Files to Change

- `app/Services/Feed/PostNormalizer.php` — extraction in `normalizeMastodonPost()` and `normalizeBlueskyPost()`; stripping in `cleanBody()`
- `resources/js/types/post.ts` — add `hashtags: string[]`
- `resources/js/components/feed/PostAnimator.tsx` — render hashtag strip; account for strip width in text container right-padding

---

## Testing

- Unit tests for `PostNormalizer`: hashtag extraction for Mastodon and Bluesky; verify hashtags are stripped from `cleanBody()` output; bare-domain URL cases for `stripUrls` and `extractFirstLink`
- Unit/integration tests for `PostAnimator` and `arc`: longest-word selection skips `@mentions` and `#hashtags`; hashtag strip renders correctly when `hashtags` is populated and is absent when empty
