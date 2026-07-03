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
export function computeChipLayout(input: ChipLayoutInput): ChipLayoutResult {
    const result = computeLayout(input);

    // modes.length + hiddenCount must always account for every input mention
    // exactly once — this is the invariant every caller (MentionChips) relies
    // on when zipping modes back against the mention list by index.
    if (import.meta.env.DEV) {
        console.assert(
            result.modes.length + result.hiddenCount ===
                input.fullWidths.length,
            'computeChipLayout: modes.length + hiddenCount must equal fullWidths.length',
        );
    }

    return result;
}

function computeLayout({
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
