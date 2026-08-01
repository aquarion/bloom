import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useOneTimeTip } from './useOneTimeTip';

beforeEach(() => {
    localStorage.clear();
});

describe('useOneTimeTip', () => {
    it('is not visible until triggered', () => {
        const { result } = renderHook(() => useOneTimeTip('cw-settings'));

        expect(result.current.visible).toBe(false);
    });

    it('becomes visible the first time it is triggered', () => {
        const { result } = renderHook(() => useOneTimeTip('cw-settings'));

        act(() => result.current.trigger());

        expect(result.current.visible).toBe(true);
    });

    it('does not show again for the same tipId after a fresh mount', () => {
        const { result, unmount } = renderHook(() =>
            useOneTimeTip('cw-settings'),
        );
        act(() => result.current.trigger());
        unmount();

        const { result: result2 } = renderHook(() =>
            useOneTimeTip('cw-settings'),
        );
        act(() => result2.current.trigger());

        expect(result2.current.visible).toBe(false);
    });

    it('tracks different tipIds independently', () => {
        const { result: cwTip } = renderHook(() =>
            useOneTimeTip('cw-settings'),
        );
        act(() => cwTip.current.trigger());

        const { result: otherTip } = renderHook(() =>
            useOneTimeTip('some-other-tip'),
        );
        act(() => otherTip.current.trigger());

        expect(otherTip.current.visible).toBe(true);
    });

    it('dismiss hides the tip', () => {
        const { result } = renderHook(() => useOneTimeTip('cw-settings'));
        act(() => result.current.trigger());
        act(() => result.current.dismiss());

        expect(result.current.visible).toBe(false);
    });
});
