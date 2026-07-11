import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { timeSince } from './Attribution';

const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('timeSince', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns "just now" for a timestamp a few seconds in the past', () => {
        const dateStr = new Date(NOW.getTime() - 5_000).toISOString();
        expect(timeSince(dateStr)).toBe('just now');
    });

    it('returns "just now" at exactly 0 seconds', () => {
        expect(timeSince(NOW.toISOString())).toBe('just now');
    });

    it('returns minutes-ago for a past timestamp under an hour old', () => {
        const dateStr = new Date(NOW.getTime() - 5 * 60_000).toISOString();
        expect(timeSince(dateStr)).toBe('5m ago');
    });

    it('returns hours-ago for a past timestamp under a day old', () => {
        const dateStr = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
        expect(timeSince(dateStr)).toBe('3h ago');
    });

    it('returns days-ago for a past timestamp a day or more old', () => {
        const dateStr = new Date(
            NOW.getTime() - 2 * 24 * 3_600_000,
        ).toISOString();
        expect(timeSince(dateStr)).toBe('2d ago');
    });

    it('returns "just now" for a timestamp a few seconds in the future', () => {
        const dateStr = new Date(NOW.getTime() + 5_000).toISOString();
        expect(timeSince(dateStr)).toBe('just now');
    });

    it('returns future minutes for a future timestamp under an hour away', () => {
        const dateStr = new Date(NOW.getTime() + 5 * 60_000).toISOString();
        expect(timeSince(dateStr)).toBe('in 5m');
    });

    it('returns future hours for a future timestamp under a day away', () => {
        const dateStr = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
        expect(timeSince(dateStr)).toBe('in 3h');
    });

    it('returns future days for a future timestamp a day or more away', () => {
        const dateStr = new Date(
            NOW.getTime() + 2 * 24 * 3_600_000,
        ).toISOString();
        expect(timeSince(dateStr)).toBe('in 2d');
    });
});
