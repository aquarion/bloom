# Moderation Label Overlay — Design

**Date:** 2026-07-04
**Milestone:** 1.6

## Problem

When a Bluesky author carries a moderation label (e.g. "rude"), the CW overlay displays "This author posts content warning" — which is both grammatically broken and uninformative. The specific label is not shown, and there is no indication of which author triggered the overlay.

## Scope

Bluesky only. Mastodon CWs are always post-level `spoiler_text` self-authored by the poster; `cw_is_author_level` is already hardcoded `false` for Mastodon and is unaffected.

---

## Backend — `PostNormalizer::blueskyLabels()`

### 1. Extract `src` alongside `val`

The `$filter` closure currently returns only `val` strings. Update it to return `[val, src]` pairs so source attribution can be determined.

### 2. Known moderation label map

Add a map to `resolveCwText` for AT Protocol account-level moderation labels. These slots into the existing "This author posts X" / "has been labelled as posting X" templates:

| Label | Display text |
|---|---|
| `rude` | rude content |
| `threat` | threatening content |
| `intolerant` | intolerant content |
| `self-harm` | self-harm content |
| `spam` | spam |
| `impersonation` | impersonation |
| `misleading` | misleading content |

Resolution order in `resolveCwText`:
1. Adult labels (`sexual`, `nudity`, `porn`) → "Adult content"
2. Graphic labels (`graphic-media`, `gore`) → "Graphic media"
3. Known moderation label map (above)
4. Unknown labels → raw label value (e.g. `"custom-thing"`), replacing the current "Content warning" generic fallback

### 3. Source resolution

Compare each label's `src` to `$post['author']['did']`:

- All label `src` values match the author's DID → `'self'`
- Any label `src` does not match → `'external'`
- No labels → `null`

`cw_label_source` is only meaningful when `cw_is_author_level` is true. It is returned from `blueskyLabels()` and passed through `fromBluesky()` to the normalised post array.

### 4. New Post field

```
cw_label_source: 'self' | 'external' | null
```

---

## Frontend — `PostContent.tsx` / `CwOverlay`

### Author chip

`CwOverlay` gains props for author identity, used only when `isAuthorLevel` is true:

- `authorName: string`
- `authorHandle: string`
- `authorAvatar: string`
- `authorEmojis: Record<string, string>`
- `labelSource: 'self' | 'external' | null`

`PostContent` passes these from `post.*` when rendering the overlay.

The existing `AuthorChip` component is reused as-is.

### Overlay layout (author-level only)

```
[line 1]  {phrasing prefix}
[chip  ]  avatar  Display Name
                  @handle
[line 2]  {phrasing suffix}
[button]  Show author
[line 3]  Revealing will unhide all their posts for this session
```

### Phrasing

| `labelSource` | Line 1 | Line 2 |
|---|---|---|
| `self` | "This author" | "marks their posts as {cwText}" |
| `external` | "This author" | "has been labelled as posting {cwText}" |

`cwText` is lowercased for display (existing behaviour). The chip sits between the two lines in all cases.

Post-level overlays (`isAuthorLevel: false`) are unchanged — no chip, no source phrasing.

---

## Types

`post.ts`:
```typescript
cw_label_source: 'self' | 'external' | null;
```

---

---

## Bug fix — keyboard shortcuts blocked by CW overlay

### Observed behaviour

Both post-level and author-level CW overlays currently block the `j` (advance) and `k` (go back) keyboard shortcuts. The space-bar pause shortcut works. Root cause to be confirmed during implementation (most likely: `animationReady` is false while `onReady` is suppressed, and something in the advance path depends on it — or a timing issue in the GSAP call).

### Intended behaviour

| Overlay type | `j` | `k` |
|---|---|---|
| Post-level CW | Advance past the post (skip without revealing) | Go back |
| Author-level CW | Advance normally | Go back |
| No overlay | Advance normally | Go back |

Neither overlay should block keyboard navigation. Auto-advance timer behaviour is unchanged (post-level CW already suppresses `onReady` which keeps the timer paused; that stays as-is).

### Fix approach

Separate the "timer advance" path from the "keyboard/manual advance" path. The timer advance is already gated on `animationReady` via `useAutoAdvance`. Keyboard-triggered `handleAdvance` and `handleGoBack` should not require `animationReady` — if the post hasn't signalled ready yet (because a CW overlay is suppressing it), the keyboard shortcut still advances. If GSAP has nothing to animate (refs not mounted), it short-circuits on the existing `!bg || !content` guard; no additional gate needed.

Exact implementation depends on root cause confirmed during implementation.

---

## Tests

**Backend (`PostNormalizerTest.php`):**
- Known moderation labels (`rude`, `threat`, etc.) resolve to their mapped display text
- Unknown label resolves to raw label value (not "Content warning")
- Self-applied label (`src` == author DID) → `cw_label_source: 'self'`
- Externally-applied label (`src` != author DID) → `cw_label_source: 'external'`
- Mixed self + external → `'external'` wins
- No labels → `cw_label_source: null`
- Mastodon posts: `fromMastodon()` explicitly sets `cw_label_source: null`; overlay unchanged

**Frontend (`PostContent.test.tsx` / `PostAnimator.test.tsx`):**
- `external` source renders "has been labelled as posting X" with author chip
- `self` source renders "marks their posts as X" with author chip
- Non-author-level overlay unchanged (no chip, no source text)

**Keyboard shortcuts (`feed.test.tsx` or equivalent):**
- `j` advances past a post-level CW overlay without requiring reveal
- `j` advances past an author-level CW overlay
- `k` goes back past both overlay types
