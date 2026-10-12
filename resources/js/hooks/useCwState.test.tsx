import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CwLike } from '@/lib/cw';
import { CwStateProvider, useCwState } from './useCwState';

const makeCwLike = (overrides: Partial<CwLike> = {}): CwLike => ({
    id: 'post-1',
    author_handle: '@alice@mastodon.social',
    cw_text: 'Adult content',
    cw_is_author_level: false,
    sensitive_media: false,
    ...overrides,
});

function wrapperWithWhitelist(initialAuthorWhitelist: string[] = []) {
    return function Wrapper({ children }: { children: ReactNode }) {
        return (
            <CwStateProvider initialAuthorWhitelist={initialAuthorWhitelist}>
                {children}
            </CwStateProvider>
        );
    };
}

describe('CwStateProvider', () => {
    beforeEach(() => {
        document.cookie = 'XSRF-TOKEN=test-token';
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok: true } as Response),
        );
    });

    afterEach(() => {
        document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        vi.unstubAllGlobals();
    });

    it('treats authors from initialAuthorWhitelist as already revealed', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(['@alice@mastodon.social']),
        });

        const post = makeCwLike({
            id: 'post-2',
            cw_is_author_level: true,
        });

        expect(result.current.isRevealed(post)).toBe(true);
    });

    it('does not persist an author already in initialAuthorWhitelist when revealed again', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(['@alice@mastodon.social']),
        });

        act(() => {
            result.current.reveal(makeCwLike({ cw_is_author_level: true }));
        });

        expect(fetch).not.toHaveBeenCalled();
    });

    it('persists a new author-level reveal to the whitelist-author endpoint', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(),
        });

        act(() => {
            result.current.reveal(makeCwLike({ cw_is_author_level: true }));
        });

        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe('/settings/feed/whitelisted-authors');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(init?.body as string)).toEqual({
            author_handle: '@alice@mastodon.social',
        });
    });

    it('persists only once when two reveal() calls for the same new author are batched together', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(),
        });

        // Simulates two reveal() calls landing in the same React update (e.g. a
        // rapid double click) before either commits.
        act(() => {
            result.current.reveal(
                makeCwLike({ id: 'post-1', cw_is_author_level: true }),
            );
            result.current.reveal(
                makeCwLike({ id: 'post-2', cw_is_author_level: true }),
            );
        });

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not persist a post-level (non-author) reveal', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(),
        });

        act(() => {
            result.current.reveal(makeCwLike({ cw_is_author_level: false }));
        });

        expect(fetch).not.toHaveBeenCalled();
    });

    it('marks the author revealed immediately after a new author-level reveal', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(),
        });

        const post = makeCwLike({ cw_is_author_level: true });
        act(() => {
            result.current.reveal(post);
        });

        expect(result.current.isRevealed(post)).toBe(true);
    });

    it('revealAlways persists the post categories to the whitelist-cw-categories endpoint', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(),
        });

        act(() => {
            result.current.revealAlways(
                makeCwLike({ cw_categories: ['adult', 'safety'] }),
            );
        });

        expect(fetch).toHaveBeenCalledTimes(1);
        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe('/settings/feed/whitelisted-cw-categories');
        expect(JSON.parse(init?.body as string)).toEqual({
            categories: ['adult', 'safety'],
        });
    });

    it('revealAlways reveals other posts whose categories are all whitelisted', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: wrapperWithWhitelist(),
        });
        const other = makeCwLike({ id: 'post-9', cw_categories: ['adult'] });
        const mixed = makeCwLike({
            id: 'post-10',
            cw_categories: ['adult', 'safety'],
        });

        act(() => {
            result.current.revealAlways(
                makeCwLike({ cw_categories: ['adult'] }),
            );
        });

        expect(result.current.isRevealed(other)).toBe(true);
        expect(result.current.isRevealed(mixed)).toBe(false);
    });

    it('treats categories from initialLabelWhitelist as already revealed', () => {
        const { result } = renderHook(() => useCwState(), {
            wrapper: ({ children }: { children: ReactNode }) => (
                <CwStateProvider initialLabelWhitelist={['generic']}>
                    {children}
                </CwStateProvider>
            ),
        });

        expect(
            result.current.isRevealed(
                makeCwLike({ cw_categories: ['generic'] }),
            ),
        ).toBe(true);
    });
});
