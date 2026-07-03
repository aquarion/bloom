# Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vim-style keyboard shortcuts (`j`/`k`/`Space`/`o`/`l`/`?`) to the feed page, with history buffering for going back to previously-seen posts and a `?` help overlay.

**Architecture:** History is added to the `useFeedQueue` reducer so post state stays centralised; a new `useKeyboardShortcuts` hook wires a single `keydown` listener to a handler map; `feed.tsx` composes them and renders a `KeyboardShortcutsOverlay` component. Auto-advance pause on `goBack` is handled in `feed.tsx` to keep `useFeedQueue` free of UI concerns.

**Tech Stack:** React hooks, TypeScript, Vitest + @testing-library/react

---

## File Map

| File | Change |
|------|--------|
| `resources/js/hooks/useFeedQueue.ts` | Add `history: Post[]` to reducer state; add `go_back` action; update `advance` to push to history (cap 50); export `goBack` |
| `resources/js/hooks/useFeedQueue.test.ts` | Add tests for `goBack` |
| `resources/js/hooks/useKeyboardShortcuts.ts` | New — register `keydown` on `window`, skip form elements |
| `resources/js/hooks/useKeyboardShortcuts.test.ts` | New — tests for key dispatch and suppression |
| `resources/js/components/feed/KeyboardShortcutsOverlay.tsx` | New — help overlay component |
| `resources/js/pages/feed.tsx` | Wire `goBack`, `openPost`, `openLink`, `useKeyboardShortcuts`, render overlay |

---

## Task 1: Add history to `useFeedQueue`

**Files:**
- Modify: `resources/js/hooks/useFeedQueue.ts`
- Modify: `resources/js/hooks/useFeedQueue.test.ts`

- [ ] **Step 1: Write failing tests for `goBack`**

Add these tests to `resources/js/hooks/useFeedQueue.test.ts`:

```typescript
it('goBack is a no-op when history is empty', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('1');
});

it('goBack restores the previous post after one advance', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('2');
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('1');
});

it('goBack does not modify the forward queue', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    const queueBefore = result.current.queue.map((p) => p.id);
    act(() => result.current.goBack());
    expect(result.current.queue.map((p) => p.id)).toEqual(queueBefore);
});

it('caps history at 50 posts', () => {
    const posts = Array.from({ length: 60 }, (_, i) => makePost(String(i)));
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    for (let i = 0; i < 55; i++) {
        act(() => result.current.advance());
    }
    for (let i = 0; i < 50; i++) {
        act(() => result.current.goBack());
    }
    const idBefore = result.current.current?.id;
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe(idBefore);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- useFeedQueue
```

Expected: 4 new failures (`goBack is not a function` or similar).

- [ ] **Step 3: Update the reducer in `useFeedQueue.ts`**

Replace the top of `resources/js/hooks/useFeedQueue.ts` (types and reducer) with:

```typescript
const REFILL_THRESHOLD = 5;
const HISTORY_CAP = 50;

type State = {
    current: Post | null;
    queue: Post[];
    cursor: string | null;
    history: Post[];
};
type Action =
    | { type: 'advance' }
    | { type: 'go_back' }
    | { type: 'enqueue'; posts: Post[]; cursor: string | null };

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'advance': {
            const [next, ...rest] = state.queue;
            const history = state.current
                ? [...state.history.slice(-(HISTORY_CAP - 1)), state.current]
                : state.history;
            return { ...state, current: next ?? null, queue: rest, history };
        }

        case 'go_back': {
            if (state.history.length === 0) return state;
            const prev = state.history[state.history.length - 1];
            const history = state.history.slice(0, -1);
            return { ...state, current: prev, history };
        }

        case 'enqueue': {
            const seen = new Set<string>([
                ...(state.current ? [state.current.id] : []),
                ...state.queue.map((p) => p.id),
            ]);
            const incoming = action.posts
                .filter((p) => {
                    if (seen.has(p.id)) {
                        return false;
                    }
                    seen.add(p.id);
                    return true;
                })
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
            const merged = [...state.queue, ...incoming];

            if (state.current === null && merged.length > 0) {
                return {
                    current: merged[0],
                    queue: merged.slice(1),
                    cursor: action.cursor,
                    history: state.history,
                };
            }

            return { ...state, queue: merged, cursor: action.cursor };
        }
    }
}
```

Also update the `useReducer` initial state call to include `history: []`:

```typescript
const [state, dispatch] = useReducer(reducer, {
    current: filteredInitial[0] ?? null,
    queue: filteredInitial.slice(1),
    cursor: initialCursor,
    history: [],
});
```

Add the `goBack` callback after `advance` and include it in the return:

```typescript
const goBack = useCallback(() => {
    dispatch({ type: 'go_back' });
}, []);

return { current: state.current, queue: state.queue, advance, goBack };
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- useFeedQueue
```

Expected: all tests pass, including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add resources/js/hooks/useFeedQueue.ts resources/js/hooks/useFeedQueue.test.ts
git commit -m "feat: add history buffer and goBack to useFeedQueue"
```

---

## Task 2: `useKeyboardShortcuts` hook

**Files:**
- Create: `resources/js/hooks/useKeyboardShortcuts.ts`
- Create: `resources/js/hooks/useKeyboardShortcuts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `resources/js/hooks/useKeyboardShortcuts.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function fireKeyOnWindow(key: string) {
    act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
}

it('calls the handler for a matching key', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    fireKeyOnWindow('j');
    expect(handler).toHaveBeenCalledOnce();
});

it('does not call handler for unregistered keys', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    fireKeyOnWindow('x');
    expect(handler).not.toHaveBeenCalled();
});

it('suppresses the handler when focus is inside an input', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
        );
    });
    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
});

it('suppresses the handler when focus is inside a textarea', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    act(() => {
        textarea.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
        );
    });
    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
});

it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ j: handler }));
    unmount();
    fireKeyOnWindow('j');
    expect(handler).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- useKeyboardShortcuts
```

Expected: all 5 fail (`Cannot find module './useKeyboardShortcuts'`).

- [ ] **Step 3: Create the hook**

Create `resources/js/hooks/useKeyboardShortcuts.ts`:

```typescript
import { useEffect, useRef } from 'react';

type ShortcutMap = Record<string, () => void>;

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
    const shortcutsRef = useRef(shortcuts);

    useEffect(() => {
        shortcutsRef.current = shortcuts;
    });

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            if (FORM_TAGS.has(target.tagName) || target.isContentEditable) {
                return;
            }
            const handler = shortcutsRef.current[e.key];
            if (handler) {
                e.preventDefault();
                handler();
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- useKeyboardShortcuts
```

Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add resources/js/hooks/useKeyboardShortcuts.ts resources/js/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat: add useKeyboardShortcuts hook"
```

---

## Task 3: `KeyboardShortcutsOverlay` component

**Files:**
- Create: `resources/js/components/feed/KeyboardShortcutsOverlay.tsx`

- [ ] **Step 1: Create the component**

Create `resources/js/components/feed/KeyboardShortcutsOverlay.tsx`:

```tsx
const SHORTCUTS = [
    { key: 'j', description: 'Next post' },
    { key: 'k', description: 'Previous post' },
    { key: 'Space', description: 'Pause / resume' },
    { key: 'o', description: 'Open post' },
    { key: 'l', description: 'Open link in post' },
    { key: '?', description: 'Show / hide this overlay' },
    { key: 'Esc', description: 'Close overlay' },
];

export function KeyboardShortcutsOverlay({
    open,
}: {
    open: boolean;
}) {
    if (!open) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="rounded-lg bg-white/10 p-6 text-white backdrop-blur-sm">
                <h2 className="mb-4 text-lg font-semibold">Keyboard Shortcuts</h2>
                <table className="w-full text-sm">
                    <tbody>
                        {SHORTCUTS.map(({ key, description }) => (
                            <tr
                                key={key}
                                className="border-b border-white/10 last:border-0"
                            >
                                <td className="py-2 pr-8">
                                    <kbd className="rounded bg-white/20 px-2 py-0.5 font-mono text-xs">
                                        {key}
                                    </kbd>
                                </td>
                                <td className="py-2 text-white/80">{description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Run the full test suite to confirm nothing is broken**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/feed/KeyboardShortcutsOverlay.tsx
git commit -m "feat: add KeyboardShortcutsOverlay component"
```

---

## Task 4: Wire everything into `feed.tsx`

**Files:**
- Modify: `resources/js/pages/feed.tsx`

- [ ] **Step 1: Add imports and helpers at the top of `feed.tsx`**

Add these imports alongside the existing ones:

```tsx
import { KeyboardShortcutsOverlay } from '@/components/feed/KeyboardShortcutsOverlay';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
```

Add this helper function outside the component (after the imports):

```typescript
function extractFirstLink(html: string): string | null {
    const match = html.match(/href="([^"]+)"/);
    return match?.[1] ?? null;
}
```

- [ ] **Step 2: Destructure `goBack` from `useFeedQueue` and add `showHelp` state**

Change the existing `useFeedQueue` call from:

```tsx
const { current, advance, queue } = useFeedQueue({
```

to:

```tsx
const { current, advance, queue, goBack } = useFeedQueue({
```

Add `showHelp` state directly after the existing `paused` state declaration:

```tsx
const [showHelp, setShowHelp] = useState(false);
```

- [ ] **Step 3: Add action callbacks**

Add these after the existing `handleAdvance` callback:

```tsx
const handleGoBack = useCallback(() => {
    goBack();
    setPaused(true);
}, [goBack]);

const openPost = useCallback(() => {
    if (current) {
        window.open(current.original_url, '_blank', 'noopener,noreferrer');
    }
}, [current]);

const openLink = useCallback(() => {
    if (!current) return;
    const url = current.link_url ?? extractFirstLink(current.body);
    if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}, [current]);

const toggleHelp = useCallback(() => setShowHelp((s) => !s), []);
const closeHelp = useCallback(() => setShowHelp(false), []);
```

- [ ] **Step 4: Register keyboard shortcuts**

Add this call after the `useAutoAdvance` call:

```tsx
useKeyboardShortcuts({
    j: handleAdvance,
    k: handleGoBack,
    ' ': () => setPaused((p) => !p),
    o: openPost,
    l: openLink,
    '?': toggleHelp,
    Escape: closeHelp,
});
```

- [ ] **Step 5: Render the overlay**

Inside the feed's chrome layer `<div>` (the one with `className="pointer-events-none absolute inset-0 z-20 flex flex-col"`), add the overlay as the last child before the closing tag:

```tsx
<KeyboardShortcutsOverlay open={showHelp} />
```

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add resources/js/pages/feed.tsx
git commit -m "feat: wire keyboard shortcuts into feed page (#108)"
```

---

## Task 5: Manual verification

- [ ] **Start the dev server**

```bash
bash dev-server.sh
```

- [ ] **Open the feed and test each shortcut**

Navigate to `/feed` and verify:
- `j` advances to the next post (with animation)
- `k` goes back to the previous post and pauses auto-advance
- `Space` toggles pause/resume (progress bar stops/starts)
- `o` opens the current post's URL in a new tab
- `l` opens the first link in the post body in a new tab (or `original_url` if no body link)
- `?` shows the overlay; pressing `?` again closes it; pressing `Esc` closes it
- Typing in any form field (if any exist in the UI) does not trigger shortcuts

- [ ] **Close the dev server and commit if any fixes were needed**

If you made any adjustments during manual testing, commit them:

```bash
git add -p
git commit -m "fix: keyboard shortcuts manual testing adjustments"
```
