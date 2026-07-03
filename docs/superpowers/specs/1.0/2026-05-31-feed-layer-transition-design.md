# Feed Layer Transition Design

**Date:** 2026-05-31
**Branch:** feature/visual-improvements

## Problem

The current feed transition in `feed.tsx` fades the entire `PostCard` container to opacity 0, exposing the `bg-black` wrapper underneath before the next post fades in. This creates an unwanted black flash between posts.

Additionally, static chrome elements (home button, pause button, progress bar, source badge) are bundled inside `PostCard` and participate in the zoom/blur transition — which they shouldn't. As chrome elements accumulate, this becomes increasingly wrong.

## Goal

1. Crossfade directly between post backgrounds (no black flash)
2. Extract static chrome elements out of the transition entirely

## Architecture

Replace the single `PostCard` with a three-layer model in `feed.tsx`:

```
feed.tsx (h-screen, relative, overflow-hidden)
├── Background layer  (absolute inset-0, z-0)
│   ├── PostBackground(post=queue[0] ?? current)   ← bottom, always opacity 1
│   └── PostBackground(post=current, ref=bgRef)    ← top, fades out on transition
├── Content layer  (absolute inset-0, z-10, ref=contentRef)
│   └── PostContent(post=current, onReady=...)
└── Chrome layer  (absolute inset-0, z-20, pointer-events-none)
    ├── Home button (pointer-events-auto)
    ├── SourceBadge (pointer-events-auto)
    ├── Pause / Play button (pointer-events-auto)
    └── ProgressBar
```

## Background Crossfade Mechanism

The bottom background slot always pre-renders the next post's background (`queue[0]`). On transition:

1. Top background (`bgRef`) fades to opacity 0 — reveals the destination bg underneath
2. Content (`contentRef`) simultaneously zooms/blurs out
3. `advance()` fires — `current` shifts to next post, `queue[0]` shifts to next-next
4. React re-renders: top bg now holds new current's bg at opacity 0; bottom holds new `queue[0]`
5. Content zooms/blurs back in
6. Top bg opacity snaps to 1 (at opacity 0, so no visible jump)

When the queue is empty, both slots show `current` — crossfade is same-to-same, harmless.

## New Components

### `PostBackground`

Extracted from `PostCard`. Renders one post's background, filling its container.

```
Props: { post: Post }
```

Background variants (same logic as current PostCard):
- **Solid colour** — `postColors(post.author_handle).background` via inline `backgroundColor`
- **Media** — renders `<MediaBackground media={post.media} />`
- **Banner** — blurred, scaled banner image at opacity 0.7
- **Fallback** — black (no color, no media, no banner)

### `PostContent`

`PostCard` with chrome and background stripped out. Contains only:
- `PostAnimator` (text animation)

```
Props: { post: Post, onReady?: () => void }
```

Derives `colors` from `postColors` internally (same logic as current `PostCard`).

### `PostCard` — deleted

Only consumed by `feed.tsx`. Once split into `PostBackground` + `PostContent`, `PostCard` has no remaining role.

## Modified: `feed.tsx`

- Owns `bgRef` (top background div) and `contentRef` (content div)
- Chrome elements moved here from `PostCard`
- `handleAdvance` updated:
  - Fades `bgRef` opacity 0→(advance)→reset to 1
  - Zoom/blurs `contentRef` as before
  - Both animations start simultaneously (GSAP timeline with position `0`)

## What Does Not Change

- `PostAnimator` — unchanged
- `MediaBackground` — unchanged
- `Attribution`, `SourceBadge`, `ProgressBar` — unchanged, just re-homed to `feed.tsx`
- `useAutoAdvance`, `useFeedQueue` — unchanged
- Transition timing (0.3s in/out) — unchanged

## Test Coverage

No new logic is introduced — this is purely a structural refactor plus a GSAP opacity animation on `bgRef`. Existing tests cover `PostCard`/`PostAnimator` behaviour; the component rename `PostCard → PostContent` requires updating any test imports.
