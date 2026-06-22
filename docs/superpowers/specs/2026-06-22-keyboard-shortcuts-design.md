# Keyboard Shortcuts — Design Spec

**Date:** 2026-06-22
**Issue:** #108

## Overview

Add vim-style keyboard shortcuts to the feed page, with a `?` help overlay. History buffering in `useFeedQueue` enables navigating back to recently-seen posts.

## Key Bindings

| Key | Action |
|-----|--------|
| `j` | Next post (advance) |
| `k` | Previous post (go back in history) |
| `Space` | Pause / resume auto-advance |
| `o` | Open current post URL in new tab |
| `l` | Open first link in post body in new tab |
| `?` | Toggle shortcuts help overlay |

Shortcuts are suppressed when focus is inside an `<input>`, `<textarea>`, or `[contenteditable]` element.

## Architecture

### `useFeedQueue` — history buffer

- Adds a bounded history stack (cap: 50 posts) alongside the existing queue state.
- `advance()` pushes `current` onto the history stack before moving forward.
- New `goBack()` function: pops the top of the history stack and sets it as `current`. Pauses auto-advance when called. Does not modify the forward queue.
- When history is empty, `goBack()` is a no-op.

### `useKeyboardShortcuts` hook

- New file: `hooks/useKeyboardShortcuts.ts`
- Accepts a `Record<string, () => void>` map of key → handler.
- Registers a single `keydown` listener on `window`.
- Skips events where `event.target` is `INPUT`, `TEXTAREA`, or has `contenteditable`.
- Handlers are captured in a ref so the listener itself is stable across renders.
- Feed.tsx calls it with: `{ j: handleAdvance, k: goBack, ' ': togglePause, o: openPost, l: openLink, '?': toggleHelp }`.

### Help overlay component

- New file: `components/feed/KeyboardShortcutsOverlay.tsx`
- Rendered inside the feed chrome layer (z-index above content, below nothing).
- Semi-transparent dark fullscreen background.
- Two-column table: key → description.
- Dismissed by pressing `?` again or `Escape`. `Escape` is added to the shortcut map in feed.tsx and calls `closeHelp` (a no-op when overlay is already closed).
- No animation required — instant show/hide.

### `openPost` and `openLink` helpers

- `openPost`: calls `window.open(current.url, '_blank', 'noopener')`.
- `openLink`: extracts the first `<a href>` from the post's HTML content and opens it in a new tab. No-op if no link found.

## Testing

- `useKeyboardShortcuts`: unit test that fires synthetic `keydown` events and verifies handlers are called; verifies suppression when target is a form element.
- `useFeedQueue`: extend existing tests to cover `goBack()` — back from empty history (no-op), back after one advance, back after multiple advances, history cap at 50.
- `KeyboardShortcutsOverlay`: rendered/hidden state driven by a boolean prop — no behaviour logic to test.
