# Mention Chip Overflow Design

**Issue:** #143 — "Mention chips: collapse to avatar-only when space-constrained"

## Background

Issue #141 (mention classification) added `MentionChips`, a row of full author chips (avatar + name + handle) rendered wherever a post has incidental/chip-classified `@mentions`: the feed page's attribution row, and the reply/quote preview cards (`ContextPanel` in `PostAnimator.tsx`).

Neither location had real overflow handling at ship time:

- **Attribution row** (`resources/js/pages/feed.tsx`): the row is a non-wrapping flex container (`flex items-center gap-2`), but `MentionChips`' own internal `flex flex-wrap` lets its chips wrap onto a second line within their own box. This grows the row's height and eats into the post content above it — visually awkward, not what we want.
- **Preview cards**: shipped with a hardcoded mitigation — `MentionChips` got a `maxVisible` prop, and `ContextPanel` capped it to 2 chips + a "+N more" text badge, regardless of actual available space. This was an explicit stopgap (see commit `d63f7ba`), not a real fix.

## Goal

Replace both ad-hoc behaviors with one self-contained, space-aware behavior: when a row of mention chips doesn't have room to show every mention as a full chip (avatar + name + handle), it should progressively collapse chips to avatar-only circles, starting from the rightmost (last) mention, until the row fits on one line without wrapping. If even all-avatar-circles doesn't fit, hide the excess from the right and show a small "+N" badge.

This applies uniformly to both call sites (attribution row, preview cards) — there is no longer a separate hardcoded cap for the preview card.

## Design

### 1. Pure layout function — `computeChipLayout`

New file: `resources/js/lib/chip-layout.ts`.

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
    /** One entry per mention, in the same order as the input — the rendering mode for that slot. */
    modes: ChipMode[];
    /** Mentions beyond `modes.length` that are hidden entirely, represented by the "+N" badge. */
    hiddenCount: number;
}

export function computeChipLayout(input: ChipLayoutInput): ChipLayoutResult;
```

**Algorithm:**

1. Let `n = fullWidths.length`. If `n === 0`, return `{ modes: [], hiddenCount: 0 }`.
2. Try `fullCount` from `n` down to `0`. For each candidate, the layout is: the first `fullCount` mentions render `'full'` (using their real measured widths), the remaining `n - fullCount` render `'avatar'` (fixed `avatarWidth` each). Total width = `sum(fullWidths[0..fullCount)) + avatarWidth * (n - fullCount) + gap * (n - 1)` (no gap term when `n <= 1`). The first candidate (largest `fullCount`) whose total is `<= availableWidth` wins — return its `modes` with `hiddenCount: 0`.
3. If no `fullCount` (including `0`) fits, fall back to hiding mentions from the right while reserving room for the badge. Try `visibleAvatarCount` from `n` down to `0`. For each, total width = `avatarWidth * visibleAvatarCount + gap * max(visibleAvatarCount - 1, 0) + (visibleAvatarCount < n ? gap + badgeWidth : 0)`. The first that fits wins — return `modes` of that many `'avatar'` entries, `hiddenCount: n - visibleAvatarCount`.
4. Degenerate case: if even `visibleAvatarCount = 0` (just the badge) doesn't fit `availableWidth`, return `{ modes: [], hiddenCount: n }` anyway — render whatever the badge needs; we don't try to hide the badge itself. (Only reachable on absurdly narrow containers; not worth a cleaner fallback.)

This function takes no DOM input and returns a deterministic result — fully unit-testable with plain arrays of numbers, following the same pattern as `MentionClassifier` (`app/Services/Feed/MentionClassifier.php` already does this server-side for a different problem).

### 2. `MentionAvatarChip` component

New file: `resources/js/components/feed/MentionAvatarChip.tsx`. A small sibling to `AuthorChip` for the collapsed state:

```tsx
export function MentionAvatarChip({ mention }: { mention: Mention }) {
    return (
        <a
            href={mention.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            title={mention.display_name}
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

(Mirrors `AuthorChip`'s avatar `<img>` sizing/fallback exactly, so the two render at the same height and swapping between them doesn't change the row's height.)

### 3. `MentionChips` rewrite

`resources/js/components/feed/MentionChips.tsx`. Replaces the `maxVisible`-based capping with real measurement:

- Keep the existing `dedupeByProfileUrl` step unchanged.
- Render a **hidden measurement layer**: one full `AuthorChip` per (deduped) mention, wrapped in a container styled `position: absolute; left: -9999px; top: -9999px; visibility: hidden; pointer-events: none` — laid out by the browser (so `offsetWidth` is real) but invisible and out of normal flow (doesn't affect anything around it).
- Hold `fullWidths: number[] | null` in state. In a `useLayoutEffect` keyed on the deduped mentions list (compare by joined `profile_url`s), read `offsetWidth` off each measurement-layer ref and set state. `null` means "not yet measured."
- Hold `availableWidth: number | null` in state. Ref the **visible** container div. In the same `useLayoutEffect`, read `containerRef.current.getBoundingClientRect().width` synchronously for the initial value (don't wait on `ResizeObserver`'s async first callback — that would cause a visible flash from full→collapsed on every mount). After that initial read, attach a `ResizeObserver` to the container that updates `availableWidth` state on subsequent size changes (window resize, sibling layout changes like the nav buttons appearing); disconnect it on cleanup.
- Once both `fullWidths` and `availableWidth` are non-null, call `computeChipLayout` with fixed constants for `avatarWidth` (40, matching the existing `h-10 w-10` avatar size), `gap` (8, matching the row's existing `gap-2`), and `badgeWidth` (a measured or reasonably estimated constant, e.g. 56 — covers "+9" through "+99" at the badge's font size; revisit only if real usage shows posts with 100+ mentions, which isn't realistic).
- Render: `'full'` slots as the existing `<a><AuthorChip /></a>` markup (unchanged), `'avatar'` slots as `<MentionAvatarChip />`, and the "+N" badge (existing markup/styling, just always driven by `hiddenCount` now instead of `maxVisible` arithmetic).
- While not yet measured (`fullWidths === null || availableWidth === null`), render the full-chip list as today (optimistic first paint) — the `useLayoutEffect` resolves before the browser paints, so in practice this state is never visible to the user; it exists only so TypeScript and the component have a defined initial render.
- Drop the `maxVisible` prop entirely.

### 4. Call site changes

- `resources/js/components/feed/PostAnimator.tsx`: `ContextPanel`'s `<MentionChips mentions={chip_mentions} maxVisible={2} />` → `<MentionChips mentions={chip_mentions} />`. Remove the now-stale comment about capping to 2 for the narrow panel.
- `resources/js/pages/feed.tsx`: the attribution row's `MentionChips` needs to actually have a bounded width to measure against. Wrap it (or have `MentionChips`' own outer container default to) `min-w-0 flex-1` so it shrinks to share space with `Attribution` and the nav buttons rather than growing unbounded — this is the root cause of today's wrap-to-2-lines behavior, not just a `MentionChips`-internal issue. `min-w-0 flex-1` is harmless when `MentionChips` is used in a block context (the preview card), since those properties only take effect inside a flex parent.

### 5. `@` icon prefix

Mirrors the existing relationship icons in `Attribution.tsx` (`Quote`, `Repeat2` from `lucide-react`, both rendered `size-4 shrink-0 text-white/30`) so the mention-chip row reads as "these accounts are mentioned" rather than appearing unexplained next to the post's own attribution.

Add a fixed-width `AtSign` icon (`lucide-react`, same `size-4 shrink-0 text-white/30` styling) immediately before each `<MentionChips>` usage, as a sibling in the surrounding markup — *not* inside `MentionChips` itself:

- `resources/js/pages/feed.tsx`: in the attribution row, before `<MentionChips mentions={current.chip_mentions} />`.
- `resources/js/components/feed/PostAnimator.tsx`: in `ContextPanel`'s rendered content, before `<MentionChips mentions={chip_mentions} />`.

Both render only when `chip_mentions.length > 0` (the existing condition already guarding each `<MentionChips>` call) — the icon and the chip row appear and disappear together.

Because the icon is a sibling element outside `MentionChips`' own measured container (not inside the `ref`'d div that `ResizeObserver` watches), no change is needed to `computeChipLayout` or the measurement logic — the icon simply takes its fixed width out of the flex row first, and `MentionChips`' container naturally measures whatever width is left over, the same way it already shares space with `Attribution` and the nav buttons.

### 6. Testing

- `resources/js/lib/chip-layout.test.ts` (new): exhaustive cases for `computeChipLayout` — all fit full; rightmost-N collapse to avatar one at a time as width shrinks; all-avatar still doesn't fit → hide-from-right + badge; single mention; zero mentions; degenerate too-narrow-for-anything case.
- `resources/js/components/feed/MentionChips.test.tsx` (rewrite): the existing jsdom `ResizeObserver` polyfill (`resources/js/test/setup.ts`) never fires its callback, so tests drive the *initial* synchronous measurement path — `vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get')` (or `getBoundingClientRect`) stubbed per-test to simulate specific measured/available widths, then assert which mentions render as full chips (`getByText` on display name) vs avatar-only (`getByTitle`, no display name text in the DOM) vs hidden (badge text). Keep the existing dedupe-by-`profile_url` test as-is.
- `resources/js/components/feed/MentionAvatarChip.test.tsx` (new): renders an avatar image with the right `title`/`alt`/`href`, falls back to the `bloom` placeholder when `avatar` is empty (mirroring `AuthorChip`'s existing fallback test, if one exists).
- No new test for the `@` icon itself — it's a one-line conditional render alongside an existing condition, covered indirectly by any existing snapshot/render test of `feed.tsx`/`ContextPanel`; not worth a dedicated assertion.

## Out of scope

- Re-measuring on font load (a custom web font finishing load could shift true text width slightly after the initial measurement). Not handled — acceptable per-issue scope; revisit only if it causes a visible glitch in practice.
- Animating the collapse/expand transition between full and avatar modes. Instant swap, no transition — consistent with how the rest of the feed's chip UI behaves today (no entrance/exit animation on `AuthorChip` itself).
