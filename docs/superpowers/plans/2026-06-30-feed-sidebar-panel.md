# Feed Sidebar Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the feed page's Home icon link (which navigates away from the feed) with a toggle button that slides the app navigation in as an overlay drawer, keeping the user in the feed.

**Architecture:** A new `FeedSidebarPanel` component wraps `Sheet` + `SidebarProvider` + `AppSidebarContents`, giving the feed page a self-contained drawer that satisfies `AppSidebarContents`'s `useSidebar()` context requirement without wrapping the whole feed in `AppSidebarLayout`. `feed.tsx` holds `panelOpen` state and wires the Home button and `h` keyboard shortcut to toggle it.

**Tech Stack:** React (useState, class component pattern not needed), shadcn Sheet/SheetContent primitives, SidebarProvider from `@/components/ui/sidebar`, vitest + RTL for tests.

---

## File map

| Action | Path | Purpose |
|--------|------|---------|
| **Create** | `resources/js/components/feed/FeedSidebarPanel.tsx` | Drawer wrapping Sheet + SidebarProvider + AppSidebarContents |
| **Create** | `resources/js/components/feed/FeedSidebarPanel.test.tsx` | Tests: open/closed rendering, sr-only title |
| **Modify** | `resources/js/pages/feed.tsx` | panelOpen state, Home button → toggle, `h` shortcut, render FeedSidebarPanel |
| **Modify** | `resources/js/components/feed/KeyboardShortcutsOverlay.tsx` | Add `h` entry to SHORTCUTS |

---

### Task 1: FeedSidebarPanel component

**Files:**
- Create: `resources/js/components/feed/FeedSidebarPanel.tsx`
- Create: `resources/js/components/feed/FeedSidebarPanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `resources/js/components/feed/FeedSidebarPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FeedSidebarPanel } from './FeedSidebarPanel';

vi.mock('@/components/app-sidebar-contents', () => ({
    AppSidebarContents: () => <div data-testid="sidebar-contents" />,
}));

vi.mock('@/components/ui/sidebar', () => ({
    SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('FeedSidebarPanel', () => {
    it('renders nothing visible when closed', () => {
        render(<FeedSidebarPanel open={false} onOpenChange={vi.fn()} />);
        expect(screen.queryByTestId('sidebar-contents')).not.toBeInTheDocument();
    });

    it('renders nav contents and sr-only title when open', () => {
        render(<FeedSidebarPanel open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByTestId('sidebar-contents')).toBeInTheDocument();
        expect(screen.getByText('Navigation')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run resources/js/components/feed/FeedSidebarPanel.test.tsx
```

Expected: FAIL — `FeedSidebarPanel` not found.

- [ ] **Step 3: Implement FeedSidebarPanel**

Create `resources/js/components/feed/FeedSidebarPanel.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { AppSidebarContents } from '@/components/app-sidebar-contents';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { SidebarProvider } from '@/components/ui/sidebar';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function FeedSidebarPanel({ open, onOpenChange }: Props) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="left"
                className="bg-sidebar text-sidebar-foreground w-(--sidebar-width) p-0 [&>button]:hidden"
                style={{ '--sidebar-width': '18rem' } as CSSProperties}
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>Navigation</SheetTitle>
                </SheetHeader>
                <SidebarProvider>
                    <AppSidebarContents />
                </SidebarProvider>
            </SheetContent>
        </Sheet>
    );
}
```

Notes:
- `bg-sidebar text-sidebar-foreground` — matches the app sidebar's colours exactly (same CSS variables used by `Sidebar` in `ui/sidebar.tsx:172`).
- `w-(--sidebar-width)` with `'--sidebar-width': '18rem'` — matches `SIDEBAR_WIDTH_MOBILE` from `ui/sidebar.tsx:29`.
- `[&>button]:hidden` — hides Radix's default close button; users close via backdrop click, Escape, or the `h` toggle (same approach as `ui/sidebar.tsx:193`).
- `SidebarProvider` satisfies `AppSidebarContents`'s `useSidebar()` requirement without any collapse/expand state — it just keeps the context tree intact.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run resources/js/components/feed/FeedSidebarPanel.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Lint and type-check**

```bash
npx eslint resources/js/components/feed/FeedSidebarPanel.tsx resources/js/components/feed/FeedSidebarPanel.test.tsx
npx tsc --noEmit
```

Expected: no errors (one pre-existing `app-header.tsx` TS error is unrelated — ignore it).

- [ ] **Step 6: Commit**

```bash
git add resources/js/components/feed/FeedSidebarPanel.tsx resources/js/components/feed/FeedSidebarPanel.test.tsx
git commit -m "🎇 Add FeedSidebarPanel overlay drawer component"
```

---

### Task 2: Wire the panel into feed.tsx

**Files:**
- Modify: `resources/js/pages/feed.tsx`
- Create: `resources/js/pages/feed.test.tsx`

- [ ] **Step 1: Write the failing feed tests**

Create `resources/js/pages/feed.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import Feed from './feed';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('gsap', () => ({
    gsap: {
        timeline: vi.fn(() => ({
            to: vi.fn().mockReturnThis(),
            call: vi.fn().mockReturnThis(),
            fromTo: vi.fn().mockReturnThis(),
        })),
        set: vi.fn(),
    },
}));

vi.mock('@/components/feed/PostBackground', () => ({ PostBackground: () => null }));
vi.mock('@/components/feed/PostContent', () => ({ PostContent: () => null }));
vi.mock('@/components/feed/Attribution', () => ({ Attribution: () => null }));
vi.mock('@/components/feed/SourceBadge', () => ({ SourceBadge: () => null }));
vi.mock('@/components/feed/ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('@/components/feed/DebugPanel', () => ({ DebugPanel: () => null }));
vi.mock('@/components/feed/MentionChips', () => ({ MentionChips: () => null }));
vi.mock('@/components/feed/KeyboardShortcutsOverlay', () => ({
    KeyboardShortcutsOverlay: () => null,
}));
vi.mock('@/components/feed/FeedSidebarPanel', () => ({
    FeedSidebarPanel: ({ open }: { open: boolean }) => (
        <div data-testid="sidebar-panel" data-open={String(open)} />
    ),
}));
vi.mock('@/hooks/useWakeLock', () => ({
    useWakeLock: () => ({ isSupported: false, isActive: false, toggle: vi.fn() }),
}));
vi.mock('@/lib/debug', () => ({
    registerFeedDebug: vi.fn(),
    setupDebugWindow: vi.fn(),
}));

const makePost = (id: string): Post => ({
    id,
    source: 'mastodon',
    source_handle: '',
    source_instance: null,
    author_name: 'Test',
    author_handle: '@test@example.com',
    author_avatar: '',
    author_banner: null,
    body: 'hello',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://example.com',
    link_url: null,
    link_title: null,
    link_favicon: null,
    reply_to: null,
    quoted_post: null,
    boosted_by: null,
    boosted_by_avatar: null,
    boosted_by_handle: null,
    boosted_by_created_at: null,
    emojis: {},
    hashtags: [],
    chip_mentions: [],
    cw_text: null,
    sensitive_media: false,
});

const defaultProps = {
    initialPosts: [makePost('1')],
    initialCursor: null,
    debugEnabled: false,
    cwBehavior: 'show' as const,
    sensitiveMediaBehavior: 'show' as const,
};

describe('Feed', () => {
    it('renders the navigation toggle button (not a link)', () => {
        render(<Feed {...defaultProps} />);
        const btn = screen.getByRole('button', { name: /open navigation/i });
        expect(btn).toBeInTheDocument();
    });

    it('opens the sidebar panel when the navigation button is clicked', () => {
        render(<Feed {...defaultProps} />);
        const panel = screen.getByTestId('sidebar-panel');
        expect(panel).toHaveAttribute('data-open', 'false');

        fireEvent.click(screen.getByRole('button', { name: /open navigation/i }));

        expect(panel).toHaveAttribute('data-open', 'true');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run resources/js/pages/feed.test.tsx
```

Expected: FAIL — the Home button is still a `<Link>`.

- [ ] **Step 3: Update feed.tsx**

Open `resources/js/pages/feed.tsx` and make these changes:

**a) Update imports** — add `FeedSidebarPanel`, remove the now-unused `connectionsEdit` import:

```tsx
// Add:
import { FeedSidebarPanel } from '@/components/feed/FeedSidebarPanel';

// Remove:
import { edit as connectionsEdit } from '@/routes/connections';
```

**b) Add panelOpen state** — inside `Feed()` alongside the existing `paused` and `showHelp` state:

```tsx
const [panelOpen, setPanelOpen] = useState(false);
```

**c) Replace the Home `<Link>` with a toggle button** — find this block (around line 233–248):

```tsx
<Link
    href={connectionsEdit()}
    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
    aria-label="Home"
>
    <svg ...>...</svg>
</Link>
```

Replace it with:

```tsx
<button
    type="button"
    onClick={() => setPanelOpen((o) => !o)}
    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
    aria-label="Open navigation"
    aria-expanded={panelOpen}
    aria-haspopup="dialog"
>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1200 1200"
        fill="currentColor"
        className="h-4 w-4"
        aria-hidden="true"
    >
        <path d="m1123 575-47.668-47.668c-33.637-33.402-74.285-58.91-119-74.664 20.543-42.758 31.25-89.566 31.336-137v-66.668c0-9.4609-3.7578-18.531-10.449-25.219-6.6875-6.6914-15.758-10.449-25.219-10.449h-66.668c-47.434 0.085938-94.242 10.793-137 31.336-15.801-44.594-41.301-85.125-74.664-118.67l-48.336-49c-6.7266-6.5742-15.758-10.258-25.164-10.258-9.4102 0-18.441 3.6836-25.168 10.258l-47.668 47.668c-33.363 33.543-58.863 74.07-74.664 118.66-42.758-20.539-89.566-31.246-137-31.332h-66.668c-9.6328-0.17969-18.93 3.543-25.773 10.324s-10.652 16.043-10.559 25.676v66.668c0.082031 47.434 10.789 94.242 31.332 137-44.707 15.766-85.355 41.27-119 74.664l-48 48.668c-6.6562 6.6836-10.395 15.734-10.395 25.168 0 9.4336 3.7383 18.48 10.395 25.164l47.668 47.668c33.637 33.406 74.285 58.91 119 74.668-20.543 42.754-31.25 89.566-31.336 137v66.668-0.003907c0 9.4609 3.7578 18.531 10.449 25.223 6.6875 6.6875 15.758 10.445 25.219 10.445h66.668c47.434-0.085938 94.242-10.793 137-31.332 15.789 44.598 41.293 85.129 74.664 118.66l47.668 47.668c6.7266 6.5742 15.758 10.258 25.168 10.258 9.4062 0 18.438-3.6836 25.164-10.258l47.668-47.668c33.371-33.535 58.875-74.066 74.668-118.66 42.754 20.539 89.566 31.246 137 31.332h66.668-0.003907c9.4609 0 18.531-3.7578 25.223-10.445 6.6875-6.6914 10.445-15.762 10.445-25.223v-66.668 0.003907c-0.085938-47.434-10.793-94.246-31.332-137 44.594-15.801 85.121-41.305 118.66-74.668l47.668-47.668c6.8516-6.4609 10.895-15.348 11.27-24.758 0.375-9.4102-2.9531-18.59-9.2695-25.574zm-206.33-291.33v33.332c-0.58594 54.195-18.793 106.73-51.863 149.66-33.074 42.938-79.223 73.945-131.47 88.34-14.215-41.512-46.82-74.117-88.332-88.332 14.719-52.277 46.082-98.324 89.332-131.17s96.027-50.691 150.34-50.832zm-316.67 387.33c-18.812-0.089844-36.816-7.6367-50.066-20.992-13.25-13.352-20.66-31.418-20.602-50.23 0.058594-18.809 7.582-36.828 20.914-50.098 13.332-13.27 31.387-20.707 50.199-20.68 18.809 0.03125 36.84 7.5234 50.133 20.836 13.289 13.312 20.754 31.352 20.754 50.164-0.085937 18.859-7.6406 36.918-21.008 50.227-13.371 13.305-31.465 20.773-50.324 20.773zm-22.668-496 22.668-22.668 22.668 22.668c29.758 29.859 51.438 66.793 63 107.33-35.617 28.328-64.812 63.891-85.668 104.34-20.895-40.328-50.09-75.77-85.668-104 11.512-40.66 33.195-77.715 63-107.67zm-293.66 108.67h33.332c54.207 0.49219 106.78 18.613 149.78 51.629 42.996 33.016 74.078 79.129 88.551 131.37-41.637 14.129-74.379 46.75-88.664 88.332-52.461-14.535-98.734-45.82-131.77-89.086-33.039-43.266-51.027-96.145-51.23-150.58zm-108.67 339-22.332-22.668 22.668-22.668h-0.003907c29.871-29.746 66.801-51.422 107.34-63 28.23 35.578 63.672 64.773 104 85.668-40.328 20.895-75.77 50.09-104 85.668-40.656-11.527-77.707-33.207-107.67-63zm108.67 294v-33.336c0.49219-54.207 18.613-106.78 51.629-149.78 33.016-43 79.129-74.082 131.37-88.555 14.285 41.582 47.027 74.203 88.664 88.332-14.656 52.336-45.992 98.461-89.246 131.37-43.258 32.906-96.07 50.801-150.42 50.965zm339 108.33-22.668 22.668-22.668-22.668c-29.758-29.859-51.438-66.793-63-107.33 35.617-28.328 64.812-63.891 85.668-104.34 20.895 40.328 50.09 75.77 85.668 104-11.512 40.66-33.195 77.715-63 107.67zm294-108.33h-33.336c-54.25-0.51562-106.86-18.688-149.86-51.766s-74.062-79.266-88.473-131.57c41.512-14.215 74.117-46.82 88.332-88.332 52.336 14.656 98.461 45.992 131.37 89.25 32.906 43.254 50.801 96.066 50.965 150.42zm108.33-294c-29.859 29.758-66.793 51.438-107.33 63-28.23-35.578-63.676-64.773-104-85.668 40.324-20.895 75.77-50.09 104-85.668 40.539 11.562 77.473 33.242 107.33 63l22.668 22.668z" />
    </svg>
</button>
```

**d) Add `h` to useKeyboardShortcuts** — find the existing `useKeyboardShortcuts({...})` call (around line 187) and add the `h` binding:

```tsx
useKeyboardShortcuts({
    j: handleAdvance,
    k: handleGoBack,
    ' ': () => setPaused((p) => !p),
    o: openPost,
    l: openLink,
    '?': toggleHelp,
    h: () => setPanelOpen((o) => !o),
    Escape: closeHelp,
});
```

**e) Render FeedSidebarPanel** — just before `<ProgressBar />` (inside the chrome layer div, after `<KeyboardShortcutsOverlay />`):

```tsx
<FeedSidebarPanel open={panelOpen} onOpenChange={setPanelOpen} />
```

The full bottom of the chrome layer div (around lines 275–319) becomes:

```tsx
                    <ProgressBar progress={progress} />
                    <KeyboardShortcutsOverlay open={showHelp} />
                    <FeedSidebarPanel open={panelOpen} onOpenChange={setPanelOpen} />
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run resources/js/pages/feed.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 5: Lint and type-check**

```bash
npx eslint resources/js/pages/feed.tsx resources/js/pages/feed.test.tsx
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/feed.tsx resources/js/pages/feed.test.tsx
git commit -m "🎇 Wire FeedSidebarPanel into feed page with h shortcut toggle"
```

---

### Task 3: Add `h` to the keyboard shortcuts overlay

**Files:**
- Modify: `resources/js/components/feed/KeyboardShortcutsOverlay.tsx`

- [ ] **Step 1: Update SHORTCUTS**

Open `resources/js/components/feed/KeyboardShortcutsOverlay.tsx`. Add the `h` entry after `'?'`:

```tsx
const SHORTCUTS = [
    { key: 'j', description: 'Next post' },
    { key: 'k', description: 'Previous post' },
    { key: 'Space', description: 'Pause / resume' },
    { key: 'o', description: 'Open post' },
    { key: 'l', description: 'Open link in post' },
    { key: '?', description: 'Show / hide this overlay' },
    { key: 'h', description: 'Open / close navigation' },
    { key: 'Esc', description: 'Close overlay' },
];
```

- [ ] **Step 2: Run the full test suite**

```bash
./vendor/bin/pest
npx vitest run
```

Expected: all PHP tests pass; all JS tests pass (including the new FeedSidebarPanel and feed tests).

- [ ] **Step 3: Lint and type-check**

```bash
npx eslint resources/js/components/feed/KeyboardShortcutsOverlay.tsx
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/feed/KeyboardShortcutsOverlay.tsx
git commit -m "🎇 Add h shortcut to keyboard shortcuts overlay"
```

---

### Task 4: Push and open PR

- [ ] **Step 1: Verify the full test suite passes**

```bash
./vendor/bin/pest
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 2: Push the branch**

```bash
git push -u origin feature/issue-86-feed-sidebar-panel
```

- [ ] **Step 3: Open a draft PR**

```bash
gh pr create --draft --base release/milestone1.6 \
  --title "feat: Slide-in sidebar panel on the feed page (#86)" \
  --body "$(cat <<'EOF'
## Summary

- Replaces the feed page's Home icon link (which navigated away to the connections page) with a toggle button that opens the app navigation as an overlay drawer
- Reuses `AppSidebarContents` — same nav items as the rest of the app (Feed, Accounts, Feed Settings, Profile, Security, Appearance, logout)
- `h` keyboard shortcut toggles the panel; added to the keyboard shortcuts overlay
- Feed continues auto-advancing in the background while the panel is open
- All existing keyboard shortcuts keep working while the panel is open
- Accessibility: `aria-expanded`, `aria-haspopup="dialog"`, sr-only `SheetTitle`

## Test plan

- [ ] Open the feed and click the circular Bloom icon in the top-left — navigation drawer should slide in from the left over a dimmed feed
- [ ] Press `h` — same behaviour
- [ ] Press `h` again (or Escape, or click backdrop) — drawer closes
- [ ] While drawer is open, press `j`/`k`/`space` — feed still responds to shortcuts
- [ ] Press `?` on the feed — keyboard shortcuts overlay should include `h — Open / close navigation`
- [ ] Click a nav item in the drawer (e.g. Accounts) — navigates away normally

Closes #86

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
