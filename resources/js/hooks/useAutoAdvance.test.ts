import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAutoAdvance } from './useAutoAdvance';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('calls onAdvance after the duration', () => {
    const onAdvance = vi.fn();
    renderHook(() =>
        useAutoAdvance({ duration: 8000, paused: false, onAdvance }),
    );
    act(() => vi.advanceTimersByTime(8000));
    expect(onAdvance).toHaveBeenCalledOnce();
});

it('calls onAdvance again after each subsequent duration', () => {
    const onAdvance = vi.fn();
    renderHook(() =>
        useAutoAdvance({ duration: 8000, paused: false, onAdvance }),
    );
    act(() => vi.advanceTimersByTime(16000));
    expect(onAdvance).toHaveBeenCalledTimes(2);
});

it('does not advance while paused', () => {
    const onAdvance = vi.fn();
    renderHook(() =>
        useAutoAdvance({ duration: 8000, paused: true, onAdvance }),
    );
    act(() => vi.advanceTimersByTime(10000));
    expect(onAdvance).not.toHaveBeenCalled();
});

it('returns progress from 1 to 0', () => {
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
        useAutoAdvance({ duration: 8000, paused: false, onAdvance }),
    );
    expect(result.current.progress).toBe(1);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.progress).toBeCloseTo(0.5, 1);
});
