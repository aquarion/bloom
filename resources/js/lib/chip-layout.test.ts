import { describe, expect, it } from 'vitest';
import type { ChipLayoutInput } from './chip-layout';
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

    it('treats an exact width match as fitting (inclusive boundary)', () => {
        // 2 full (200) + 1 gap (8) = 208, exactly equal to availableWidth.
        const result = computeChipLayout({
            fullWidths: [100, 100],
            availableWidth: 208,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({ modes: ['full', 'full'], hiddenCount: 0 });
    });

    it('hides the single mention entirely (with a hidden count, not a crash) when availableWidth is negative', () => {
        // n=1 still has no gap term, but the badge-reservation fallback kicks
        // in below zero: nothing fits, so the lone mention is fully hidden.
        // The caller (MentionChips) still renders a "+1" badge for it.
        const result = computeChipLayout({
            fullWidths: [50],
            availableWidth: -10,
            avatarWidth: 40,
            gap: 8,
            badgeWidth: 56,
        });

        expect(result).toEqual({ modes: [], hiddenCount: 1 });
    });

    it('maintains modes.length + hiddenCount === fullWidths.length across a range of inputs', () => {
        const cases: ChipLayoutInput[] = [
            {
                fullWidths: [],
                availableWidth: 100,
                avatarWidth: 40,
                gap: 8,
                badgeWidth: 56,
            },
            {
                fullWidths: [50],
                availableWidth: 10,
                avatarWidth: 40,
                gap: 8,
                badgeWidth: 56,
            },
            {
                fullWidths: [80, 80, 80, 80, 80],
                availableWidth: 120,
                avatarWidth: 40,
                gap: 8,
                badgeWidth: 56,
            },
            {
                fullWidths: [30, 60, 90, 120],
                availableWidth: 250,
                avatarWidth: 40,
                gap: 8,
                badgeWidth: 56,
            },
            {
                fullWidths: [200, 5, 5, 5, 5, 5, 5],
                availableWidth: 50,
                avatarWidth: 40,
                gap: 8,
                badgeWidth: 56,
            },
            {
                fullWidths: [10, 10, 10],
                availableWidth: 0,
                avatarWidth: 40,
                gap: 8,
                badgeWidth: 56,
            },
        ];

        for (const input of cases) {
            const result = computeChipLayout(input);

            expect(result.modes.length + result.hiddenCount).toBe(
                input.fullWidths.length,
            );
        }
    });
});
