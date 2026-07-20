# Mention Chip Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `MentionChips`' two ad-hoc overflow behaviors (uncontrolled wrap-to-2-lines in the attribution row, hardcoded cap-to-2 in reply/quote preview cards) with one space-aware behavior: chips collapse from full (avatar+name+handle) to avatar-only, rightmost first, until the row fits on one line; if even all-avatars overflows, hide the excess behind a "+N" badge. Also adds an `@` icon prefix before the chip row in both locations, matching the existing reply/quote/boost relationship-icon pattern.

**Architecture:** A pure function `computeChipLayout` (no DOM) decides, given measured chip widths and available container width, which chips render full vs avatar vs hidden. `MentionChips` measures real chip widths via a hidden off-screen render pass and the visible container's width via `ResizeObserver`, then renders accordingly. A new small `MentionAvatarChip` component handles the collapsed (avatar-only) rendering.

**Tech Stack:** TypeScript/React (Vitest, @testing-library/react), Tailwind CSS, lucide-react icons.

**Reference spec:** `docs/superpowers/specs/2026-06-26-mention-chip-overflow-design.md`

---

### Task 1: `computeChipLayout` pure layout function

**Files:**
- Create: `resources/js/lib/chip-layout.ts`
- Test: `resources/js/lib/chip-layout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `resources/js/lib/chip-layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeChipLayout } from './chip-layout';

describe('computeChipLayout', () => {
    it('returns an empty result for zero mentions', () => {
        const result = computeChipLayout({
            fullWidths: [],
            availableWidth: 400,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({ modes: [], hiddenCount: 0 });
    });

    it('keeps a single chip full even with a tiny available width', () => {
        // n=1 has no gap term, so total === fullWidths[0] regardless of availableWidth.
        const result = computeChipLayout({
            fullWidths: [50],
            availableWidth: 200,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({ modes: ['full'], hiddenCount: 0 });
    });

    it('keeps every chip full when there is room for all of them', () => {
        const result = computeChipLayout({
            fullWidths: [100, 100, 100],
            availableWidth: 400,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({
            modes: ['full', 'full', 'full'],
            hiddenCount: 0,
        });
    });

    it('collapses the rightmost chip to avatar-only when space is tight', () => {
        // 3 full (300) + 2 gaps (16) = 316, doesn't fit 300.
        // 2 full (200) + 1 avatar (40) + 2 gaps (16) = 256, fits 300.
        const result = computeChipLayout({
            fullWidths: [100, 100, 100],
            availableWidth: 300,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({
            modes: ['full', 'full', 'avatar'],
            hiddenCount: 0,
        });
    });

    it('collapses two chips from the right when space is tighter still', () => {
        // 1 full (100) + 2 avatars (80) + 2 gaps (16) = 196, fits 200.
        const result = computeChipLayout({
            fullWidths: [100, 100, 100],
            availableWidth: 200,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({
            modes: ['full', 'avatar', 'avatar'],
            hiddenCount: 0,
        });
    });

    it('collapses every chip to avatar-only when there is no room for any full chip', () => {
        // 3 avatars (120) + 2 gaps (16) = 136, fits 140.
        const result = computeChipLayout({
            fullWidths: [100, 100, 100],
            availableWidth: 140,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({
            modes: ['avatar', 'avatar', 'avatar'],
            hiddenCount: 0,
        });
    });

    it('hides the rightmost avatars and reserves room for a "+N" badge when avatars alone do not fit', () => {
        // 3 avatars (120) + 2 gaps (16) = 136, doesn't fit 110.
        // 1 avatar (40) + 0 internal gaps + (gap 8 + badge 56) = 104, fits 110.
        const result = computeChipLayout({
            fullWidths: [100, 100, 100],
            availableWidth: 110,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({ modes: ['avatar'], hiddenCount: 2 });
    });

    it('shows nothing but reports the full hidden count when even the badge does not fit', () => {
        const result = computeChipLayout({
            fullWidths: [100, 100, 100],
            availableWidth: 10,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({ modes: [], hiddenCount: 3 });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run resources/js/lib/chip-layout.test.ts`
Expected: FAIL — cannot find module `./chip-layout`.

- [ ] **Step 3: Implement `computeChipLayout`**

Create `resources/js/lib/chip-layout.ts`:

```ts
export type ChipMode = 'full' | 'avatar';

export interface ChipLayoutInput {
    /** Measured natural width (px) of each mention's full chip, in display order. */
    fullWidths: number[];
    /** Available width (px) of the container the chips render into. */
    availableWidth: number;
    /** Fixed width (px) of a collapsed avatar-only chip. */
    avatarWidth: number;
    /** Fixed gap (px) between adjacent chips/badge. */
    gap: number;
    /** Reserved width (px) for the "+N" badge, when one is needed. */
    badgeWidth: number;
}

export interface ChipLayoutResult {
    /** One entry per visible mention, in display order. Mentions beyond this length are hidden. */
    modes: ChipMode[];
    /** Mentions hidden entirely behind the "+N" badge. */
    hiddenCount: number;
}

/**
 * Decides which mentions render as full chips (avatar+name+handle), which
 * collapse to avatar-only circles, and which get hidden behind a "+N" badge,
 * given how much horizontal space is available. Collapses from the right:
 * the last mention loses its full chip first, then the one before it, and
 * so on, until the row fits.
 */
export function computeChipLayout({
    fullWidths,
    availableWidth,
    avatarWidth,
    gap,
    badgeWidth,
}: ChipLayoutInput): ChipLayoutResult {
    const n = fullWidths.length;

    if (n === 0) {
        return { modes: [], hiddenCount: 0 };
    }

    for (let fullCount = n; fullCount >= 0; fullCount--) {
        const fullTotal = fullWidths
            .slice(0, fullCount)
            .reduce((sum, width) => sum + width, 0);
        const avatarTotal = avatarWidth * (n - fullCount);
        const gapTotal = gap * Math.max(n - 1, 0);
        const total = fullTotal + avatarTotal + gapTotal;

        if (total <= availableWidth) {
            return {
                modes: [
                    ...Array<ChipMode>(fullCount).fill('full'),
                    ...Array<ChipMode>(n - fullCount).fill('avatar'),
                ],
                hiddenCount: 0,
            };
        }
    }

    for (
        let visibleAvatarCount = n;
        visibleAvatarCount >= 0;
        visibleAvatarCount--
    ) {
        const avatarTotal = avatarWidth * visibleAvatarCount;
        const gapTotal = gap * Math.max(visibleAvatarCount - 1, 0);
        const badgeTotal = visibleAvatarCount < n ? gap + badgeWidth : 0;
        const total = avatarTotal + gapTotal + badgeTotal;

        if (total <= availableWidth) {
            return {
                modes: Array<ChipMode>(visibleAvatarCount).fill('avatar'),
                hiddenCount: n - visibleAvatarCount,
            };
        }
    }

    return { modes: [], hiddenCount: n };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run resources/js/lib/chip-layout.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add resources/js/lib/chip-layout.ts resources/js/lib/chip-layout.test.ts
git commit -m "🎇 Add computeChipLayout pure overflow algorithm for mention chips"
```

---

### Task 2: `MentionAvatarChip` component

**Files:**
- Create: `resources/js/components/feed/MentionAvatarChip.tsx`
- Test: `resources/js/components/feed/MentionAvatarChip.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `resources/js/components/feed/MentionAvatarChip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Mention } from '@/types/post';
import { MentionAvatarChip } from './MentionAvatarChip';

const mention: Mention = {
    handle: '@alice',
    display_name: 'Alice',
    avatar: 'https://example.com/avatar.jpg',
    profile_url: 'https://example.com/@alice',
};

it('renders the avatar image behind a profile link with a name tooltip', () => {
    render(<MentionAvatarChip mention={mention} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/@alice');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('title', 'Alice');

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    expect(img).toHaveAttribute('alt', 'Alice');
});

it('falls back to the bloom placeholder when avatar is empty', () => {
    render(<MentionAvatarChip mention={{ ...mention, avatar: '' }} />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('bloom-standard');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run resources/js/components/feed/MentionAvatarChip.test.tsx`
Expected: FAIL — cannot find module `./MentionAvatarChip`.

- [ ] **Step 3: Implement `MentionAvatarChip`**

Create `resources/js/components/feed/MentionAvatarChip.tsx`:

```tsx
import type { Mention } from '@/types/post';
import bloom from '../../../icons/bloom-standard.svg';

export function MentionAvatarChip({ mention }: { mention: Mention }) {
    return (
        <a
            href={mention.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            title={mention.display_name}
            className="shrink-0"
        >
            <img
                src={mention.avatar || bloom}
                alt={mention.display_name}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
        </a>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run resources/js/components/feed/MentionAvatarChip.test.tsx`
Expected: PASS, both tests.

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint resources/js/components/feed/MentionAvatarChip.tsx
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add resources/js/components/feed/MentionAvatarChip.tsx resources/js/components/feed/MentionAvatarChip.test.tsx
git commit -m "🎇 Add MentionAvatarChip for collapsed mention display"
```

---

### Task 3: Rewrite `MentionChips` to measure and collapse instead of wrap/cap

**Files:**
- Modify: `resources/js/components/feed/MentionChips.tsx`
- Modify (rewrite): `resources/js/components/feed/MentionChips.test.tsx`

This replaces the `maxVisible`-based hard cap with real measurement: a hidden off-screen render pass measures each mention's true full-chip width, a `ResizeObserver`'d container measures available space, and `computeChipLayout` (Task 1) decides the cutoff.

Note on testability: the project's jsdom `ResizeObserver` polyfill (`resources/js/test/setup.ts:4-10`) is a no-op that never fires its callback, and jsdom always returns `0` for `getBoundingClientRect()`/`offsetWidth` unless a test explicitly stubs them. The component design relies on a synchronous initial read via `getBoundingClientRect()` (not waiting on `ResizeObserver`'s async first callback), so tests can stub that initial read directly to exercise every collapse path deterministically.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `resources/js/components/feed/MentionChips.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Mention } from '@/types/post';
import { MentionChips } from './MentionChips';

const makeMention = (handle: string): Mention => ({
    handle,
    display_name: handle.replace('@', ''),
    avatar: '',
    profile_url: `https://example.com/${handle}`,
});

/**
 * Stubs the two DOM reads MentionChips relies on: the visible container's
 * width (via getBoundingClientRect, read once synchronously on mount) and
 * each hidden measurement chip's width (via offsetWidth, matched up by the
 * data-mention-measure-id attribute MentionChips sets on each one).
 */
function stubMeasurements(
    containerWidth: number,
    chipWidthsByProfileUrl: Record<string, number>,
) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: containerWidth,
        height: 0,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    });

    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
        function (this: HTMLElement) {
            const id = this.dataset.mentionMeasureId;

            return id !== undefined ? chipWidthsByProfileUrl[id] ?? 0 : 0;
        },
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

it('renders nothing when there are no mentions', () => {
    const { container } = render(<MentionChips mentions={[]} />);
    expect(container).toBeEmptyDOMElement();
});

// MentionChips also renders a hidden off-screen pass of every mention (to
// measure true chip widths), which contains the same name/handle text as
// the visible row. Every assertion below scopes its queries to the visible
// container (data-testid="mention-chips-visible") so it can't accidentally
// match that hidden measurement copy.
function visibleChips() {
    return within(screen.getByTestId('mention-chips-visible'));
}

it('renders a full chip for each mention when there is room for all of them', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    stubMeasurements(400, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, bob]} />);

    expect(visibleChips().getByText('alice')).toBeInTheDocument();
    expect(visibleChips().getByText('bob')).toBeInTheDocument();
});

it('links each full chip to its profile_url in a new tab', () => {
    const alice = makeMention('@alice');
    stubMeasurements(400, { [alice.profile_url]: 100 });

    render(<MentionChips mentions={[alice]} />);

    const link = visibleChips().getByRole('link', { name: /alice/i });
    expect(link).toHaveAttribute('href', 'https://example.com/@alice');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('dedupes mentions sharing the same profile_url', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    stubMeasurements(400, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, alice, bob]} />);

    expect(visibleChips().getAllByRole('link')).toHaveLength(2);
});

it('collapses the rightmost mention to an avatar-only chip when space is tight', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    // 2 full (200) + 1 gap (8) = 208, doesn't fit 150.
    // 1 full (100) + 1 avatar (40) + 1 gap (8) = 148, fits 150.
    stubMeasurements(150, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, bob]} />);

    expect(visibleChips().getByText('alice')).toBeInTheDocument();
    expect(visibleChips().queryByText('bob')).not.toBeInTheDocument();
    expect(visibleChips().getByTitle('bob')).toBeInTheDocument();
});

it('hides excess mentions behind a "+N" badge when even avatar-only chips do not all fit', () => {
    const alice = makeMention('@alice');
    const bob = makeMention('@bob');
    const carol = makeMention('@carol');
    // 1 avatar (40) + (gap 8 + badge 56) = 104, fits 110; 2 avatars don't.
    stubMeasurements(110, {
        [alice.profile_url]: 100,
        [bob.profile_url]: 100,
        [carol.profile_url]: 100,
    });

    render(<MentionChips mentions={[alice, bob, carol]} />);

    expect(visibleChips().getByTitle('alice')).toBeInTheDocument();
    expect(visibleChips().queryByTitle('bob')).not.toBeInTheDocument();
    expect(visibleChips().queryByTitle('carol')).not.toBeInTheDocument();
    expect(visibleChips().getByText('+2')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run resources/js/components/feed/MentionChips.test.tsx`
Expected: FAIL — `maxVisible`-cap tests are gone and new assertions (e.g. `getByTitle('bob')`, `getByText('+2')`) don't match the current implementation's output.

- [ ] **Step 3: Rewrite `MentionChips`**

Replace the entire contents of `resources/js/components/feed/MentionChips.tsx`:

```tsx
import { useLayoutEffect, useRef, useState } from 'react';
import { computeChipLayout } from '@/lib/chip-layout';
import type { Mention } from '@/types/post';
import { AuthorChip } from './AuthorChip';
import { MentionAvatarChip } from './MentionAvatarChip';

const AVATAR_WIDTH = 40;
const GAP = 8;
const BADGE_WIDTH = 56;

function dedupeByProfileUrl(mentions: Mention[]): Mention[] {
    const seen = new Map<string, Mention>();

    for (const mention of mentions) {
        if (!seen.has(mention.profile_url)) {
            seen.set(mention.profile_url, mention);
        }
    }

    return [...seen.values()];
}

export function MentionChips({ mentions }: { mentions: Mention[] }) {
    const uniqueMentions = dedupeByProfileUrl(mentions);
    const mentionKey = uniqueMentions.map((m) => m.profile_url).join(',');

    const [fullWidths, setFullWidths] = useState<number[] | null>(null);
    const [availableWidth, setAvailableWidth] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRefs = useRef<Record<string, HTMLDivElement | null>>({});

    useLayoutEffect(() => {
        setFullWidths(
            uniqueMentions.map(
                (m) => measureRefs.current[m.profile_url]?.offsetWidth ?? 0,
            ),
        );

        const container = containerRef.current;
        if (!container) {
            return;
        }

        setAvailableWidth(container.getBoundingClientRect().width);

        const observer = new ResizeObserver(([entry]) => {
            setAvailableWidth(entry.contentRect.width);
        });
        observer.observe(container);

        return () => observer.disconnect();
        // mentionKey is a stable proxy for uniqueMentions (a fresh array on
        // every render); depending on the array itself would re-run this
        // effect, and its setState calls, on every single render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mentionKey]);

    if (uniqueMentions.length === 0) {
        return null;
    }

    const { modes, hiddenCount } =
        fullWidths !== null && availableWidth !== null
            ? computeChipLayout({
                  fullWidths,
                  availableWidth,
                  avatarWidth: AVATAR_WIDTH,
                  gap: GAP,
                  badgeWidth: BADGE_WIDTH,
              })
            : {
                  modes: uniqueMentions.map(() => 'full' as const),
                  hiddenCount: 0,
              };

    return (
        <>
            <div
                aria-hidden
                className="invisible absolute top-0 left-[-9999px] flex"
            >
                {uniqueMentions.map((mention) => (
                    <div
                        key={mention.profile_url}
                        data-mention-measure-id={mention.profile_url}
                        ref={(el) => {
                            measureRefs.current[mention.profile_url] = el;
                        }}
                        className="inline-block"
                    >
                        <AuthorChip
                            name={mention.display_name}
                            avatar={mention.avatar}
                            emojis={{}}
                            account={mention.handle}
                        />
                    </div>
                ))}
            </div>
            <div
                ref={containerRef}
                data-testid="mention-chips-visible"
                className="flex min-w-0 flex-1 items-center gap-2"
            >
                {uniqueMentions.slice(0, modes.length).map((mention, index) =>
                    modes[index] === 'full' ? (
                        <a
                            key={mention.profile_url}
                            href={mention.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-48 shrink-0"
                        >
                            <AuthorChip
                                name={mention.display_name}
                                avatar={mention.avatar}
                                emojis={{}}
                                account={mention.handle}
                            />
                        </a>
                    ) : (
                        <MentionAvatarChip
                            key={mention.profile_url}
                            mention={mention}
                        />
                    ),
                )}
                {hiddenCount > 0 && (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-white/50 text-xs">
                        +{hiddenCount}
                    </span>
                )}
            </div>
        </>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run resources/js/components/feed/MentionChips.test.tsx`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint resources/js/components/feed/MentionChips.tsx
```

Expected: no new errors (the `eslint-disable-next-line react-hooks/exhaustive-deps` is intentional and explained by the comment above it).

- [ ] **Step 6: Commit**

```bash
git add resources/js/components/feed/MentionChips.tsx resources/js/components/feed/MentionChips.test.tsx
git commit -m "🪳 Collapse mention chips to avatars on overflow instead of wrapping/capping"
```

---

### Task 4: Wire the `@` icon prefix and drop the old cap-to-2 callers

**Files:**
- Modify: `resources/js/pages/feed.tsx`
- Modify: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Add the icon to the attribution row in `feed.tsx`**

In `resources/js/pages/feed.tsx`, change the lucide-react import line:

```ts
import { Eye, EyeOff, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
```

to:

```ts
import {
    AtSign,
    Eye,
    EyeOff,
    Pause,
    Play,
    SkipBack,
    SkipForward,
} from 'lucide-react';
```

Then replace:

```tsx
                        <Attribution post={current} />
                        {current.chip_mentions.length > 0 && (
                            <MentionChips mentions={current.chip_mentions} />
                        )}
```

with:

```tsx
                        <Attribution post={current} />
                        {current.chip_mentions.length > 0 && (
                            <>
                                <AtSign className="size-4 shrink-0 text-white/30" />
                                <MentionChips
                                    mentions={current.chip_mentions}
                                />
                            </>
                        )}
```

- [ ] **Step 2: Add the icon to `ContextPanel` and drop `maxVisible` in `PostAnimator.tsx`**

In `resources/js/components/feed/PostAnimator.tsx`, change the lucide-react import line:

```ts
import { Quote, Reply } from 'lucide-react';
```

to:

```ts
import { AtSign, Quote, Reply } from 'lucide-react';
```

Then replace:

```tsx
            {chip_mentions.length > 0 && (
                <div className="mt-2">
                    {/* ContextPanel is narrow (max-w-[40ch]) — cap visible chips so a heavily-mentioned reply/quote doesn't blow out the panel width. */}
                    <MentionChips mentions={chip_mentions} maxVisible={2} />
                </div>
            )}
```

with:

```tsx
            {chip_mentions.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                    <AtSign className="size-4 shrink-0 text-white/30" />
                    <MentionChips mentions={chip_mentions} />
                </div>
            )}
```

- [ ] **Step 3: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint resources/js/pages/feed.tsx resources/js/components/feed/PostAnimator.tsx
```

Expected: no new errors. (`tsc` will error if `maxVisible` is still referenced anywhere — confirms the prop was fully removed in Task 3.)

- [ ] **Step 4: Run the full frontend test suite**

Run: `npx vitest run`
Expected: PASS, no regressions (in particular, no other test file references `MentionChips`' old `maxVisible` prop).

- [ ] **Step 5: Visually verify if feasible**

Run `npm run dev`, open the feed page on a beta-tester account with a post that has multiple incidental mentions. Resize the browser window narrower and confirm: chips collapse to avatars right-to-left as the window narrows, the row never wraps to a second line, and the `@` icon stays put next to the row. If no live post with enough mentions is available, this is acceptable to skip — Tasks 1-3's automated tests already cover the collapse logic directly.

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/feed.tsx resources/js/components/feed/PostAnimator.tsx
git commit -m "🖼️ Add @ icon prefix to mention chip rows, drop old cap-to-2 mitigation"
```
