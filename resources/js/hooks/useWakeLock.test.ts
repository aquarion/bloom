import { act, renderHook } from '@testing-library/react';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWakeLock } from './useWakeLock';

describe('useWakeLock', () => {
    let mockRequest: Mock;
    let mockRelease: Mock;
    let mockSentinel: {
        release: Mock;
        addEventListener: Mock;
        removeEventListener: Mock;
        onRelease?: () => void;
    };
    let originalVisibilityState: PropertyDescriptor | undefined;

    beforeEach(() => {
        originalVisibilityState = Object.getOwnPropertyDescriptor(
            document,
            'visibilityState',
        );

        mockRelease = vi.fn().mockResolvedValue(undefined);
        mockSentinel = {
            release: mockRelease,
            addEventListener: vi.fn((event, callback) => {
                if (event === 'release') {
                    mockSentinel.onRelease = callback;
                }
            }),
            removeEventListener: vi.fn(),
        };
        mockRequest = vi.fn().mockResolvedValue(mockSentinel);

        Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: {
                request: mockRequest,
            },
        });
    });

    afterEach(() => {
        // @ts-expect-error - navigator.wakeLock is not optional in all TS lib configurations but we delete it for test cleanup
        delete navigator.wakeLock;

        if (originalVisibilityState) {
            Object.defineProperty(
                document,
                'visibilityState',
                originalVisibilityState,
            );
        } else {
            // @ts-expect-error - document.visibilityState is read-only in typical typings but we delete it in tests
            delete document.visibilityState;
        }

        vi.restoreAllMocks();
    });

    it('requests wake lock when hook mounts', async () => {
        const { result } = renderHook(() => useWakeLock());

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(mockRequest).toHaveBeenCalledWith('screen');
        expect(result.current.isActive).toBe(true);
        expect(result.current.isSupported).toBe(true);
    });

    it('releases wake lock when hook unmounts', async () => {
        const { unmount } = renderHook(() => useWakeLock());

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        unmount();

        expect(mockRelease).toHaveBeenCalledOnce();
    });

    it('re-requests wake lock when page visibility changes to visible', async () => {
        renderHook(() => useWakeLock());

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        // When the tab becomes hidden, the hook should proactively release the wake lock
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(mockRelease).toHaveBeenCalledOnce();

        mockRequest.mockClear();

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(mockRequest).toHaveBeenCalledWith('screen');
    });

    it('handles browsers that do not support wakeLock', () => {
        // @ts-expect-error - navigator.wakeLock is not optional in all TS lib configurations but we delete it to simulate unsupported environments
        delete navigator.wakeLock;

        const { result } = renderHook(() => useWakeLock());

        expect(result.current.isSupported).toBe(false);
        expect(result.current.isActive).toBe(false);
    });

    it('toggle disables the wake lock and releases the sentinel', async () => {
        const { result } = renderHook(() => useWakeLock());

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(result.current.isActive).toBe(true);

        await act(async () => {
            result.current.toggle();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(mockRelease).toHaveBeenCalledOnce();
        expect(result.current.isActive).toBe(false);
    });

    it('toggle re-enables the wake lock and re-acquires the sentinel', async () => {
        const { result } = renderHook(() => useWakeLock());

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        // Disable
        await act(async () => {
            result.current.toggle();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        mockRequest.mockClear();

        // Re-enable
        await act(async () => {
            result.current.toggle();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(mockRequest).toHaveBeenCalledWith('screen');
        expect(result.current.isActive).toBe(true);
    });

    it('does not re-acquire when disabled and page visibility changes to visible', async () => {
        const { result } = renderHook(() => useWakeLock());

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        // Disable
        await act(async () => {
            result.current.toggle();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        mockRequest.mockClear();

        // Simulate tab hide then show
        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(mockRequest).not.toHaveBeenCalled();
        expect(result.current.isActive).toBe(false);
    });

    it('releases a late-resolving sentinel if hook unmounts before request() resolves', async () => {
        // Create a deferred promise so we control when request() resolves
        let resolveRequest!: (sentinel: unknown) => void;
        mockRequest.mockReturnValue(
            new Promise((resolve) => {
                resolveRequest = resolve;
            }),
        );

        const { unmount } = renderHook(() => useWakeLock());

        // Unmount before the request resolves
        unmount();

        // Now resolve the request — the hook should release the sentinel
        // immediately since it's no longer mounted
        await act(async () => {
            resolveRequest(mockSentinel);
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(mockRelease).toHaveBeenCalledOnce();
    });
});
