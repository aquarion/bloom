import { router } from '@inertiajs/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { useFeedQueue } from './useFeedQueue';

vi.mock('axios');
vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
}));

const makePost = (id: string, created_at?: string): Post => ({
    id,
    source: 'mastodon',
    source_handle: '',
    author_name: 'Test',
    author_handle: '@test@example.com',
    author_avatar: '',
    author_banner: null,
    body: 'hello',
    media: [],
    created_at: created_at ?? new Date().toISOString(),
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

it('initialises with provided posts', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    expect(result.current.current?.id).toBe('1');
    expect(result.current.queue).toHaveLength(1);
});

it('dequeues the head of the queue', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('2');
    expect(result.current.queue).toHaveLength(1);
});

it('fetches more posts when queue drops to 5', async () => {
    const posts = Array.from({ length: 6 }, (_, i) => makePost(String(i)));
    const newPosts = [makePost('extra1'), makePost('extra2')];

    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: newPosts, next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: 'cursor123' }),
    );

    await act(async () => result.current.advance());

    expect(axios.get).toHaveBeenCalledWith('/feed', {
        params: { cursor: 'cursor123' },
        headers: { Accept: 'application/json' },
    });
});

it('deduplicates posts already in the queue and the current post when new batch arrives', async () => {
    // post "1" is current, "2" is in queue — both should be excluded from the incoming batch
    const posts = [
        makePost('1', '2026-06-01T12:00:00Z'),
        makePost('2', '2026-06-01T11:00:00Z'),
    ];

    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [
                makePost('1', '2026-06-01T12:00:00Z'),
                makePost('2', '2026-06-01T11:00:00Z'),
                makePost('3', '2026-06-01T10:00:00Z'),
            ],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: 'cursor123' }),
    );

    await waitFor(() => expect(result.current.queue).toHaveLength(2));

    const ids = [
        result.current.current?.id,
        ...result.current.queue.map((p) => p.id),
    ];
    expect(ids).toEqual(['1', '2', '3']);
});

it('appends incoming posts after existing queue to avoid skipping buffered posts', async () => {
    // "mid" is current, "old" is in queue — "new" (newer timestamp) should be
    // appended after "old" so buffered posts are never skipped.
    const posts = [
        makePost('mid', '2026-06-01T10:00:00Z'),
        makePost('old', '2026-06-01T09:00:00Z'),
    ];

    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('new', '2026-06-01T12:00:00Z')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: 'cursor123' }),
    );

    await waitFor(() => expect(result.current.queue).toHaveLength(2));

    expect(result.current.queue.map((p) => p.id)).toEqual(['old', 'new']);
});

it('redirects to login when feed refill gets unauthenticated', async () => {
    const posts = Array.from({ length: 6 }, (_, i) => makePost(String(i)));

    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.get).mockRejectedValue({
        isAxiosError: true,
        response: { status: 401 },
    });
    vi.mocked(router.visit).mockClear();

    renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: 'cursor123' }),
    );

    await act(async () => Promise.resolve());

    expect(router.visit).toHaveBeenCalledWith('/login');
});

it('skips posts with cw_text when cwBehavior is skip', () => {
    const cwPost = makePost('cw1');
    cwPost.cw_text = 'Content warning';

    const normalPost = makePost('normal1');

    const { result } = renderHook(() =>
        useFeedQueue({
            initialPosts: [cwPost, normalPost],
            initialCursor: null,
            cwBehavior: 'skip',
            sensitiveMediaBehavior: 'show',
        }),
    );

    expect(result.current.current?.id).toBe('normal1');
    expect(result.current.queue).toHaveLength(0);
});

it('skips posts with sensitive_media when sensitiveMediaBehavior is skip', () => {
    const sensitivePost = makePost('sensitive1');
    sensitivePost.sensitive_media = true;

    const normalPost = makePost('normal2');

    const { result } = renderHook(() =>
        useFeedQueue({
            initialPosts: [sensitivePost, normalPost],
            initialCursor: null,
            cwBehavior: 'show',
            sensitiveMediaBehavior: 'skip',
        }),
    );

    expect(result.current.current?.id).toBe('normal2');
});

it('does not skip cw posts when cwBehavior is blur', () => {
    const cwPost = makePost('cw2');
    cwPost.cw_text = 'Spoiler';

    const { result } = renderHook(() =>
        useFeedQueue({
            initialPosts: [cwPost],
            initialCursor: null,
            cwBehavior: 'blur',
            sensitiveMediaBehavior: 'show',
        }),
    );

    expect(result.current.current?.id).toBe('cw2');
});

it('filters cw posts from fetchMore response when cwBehavior is skip', async () => {
    const normalPost = makePost('normal-fetch');
    const cwPost = makePost('cw-fetch');
    cwPost.cw_text = 'Spoiler content';

    // Start with enough posts and a cursor so fetchMore will be triggered
    const posts = Array.from({ length: 6 }, (_, i) => makePost(`init-${i}`));

    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [cwPost, normalPost], next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({
            initialPosts: posts,
            initialCursor: 'cursor123',
            cwBehavior: 'skip',
            sensitiveMediaBehavior: 'show',
        }),
    );

    // Advance enough to trigger fetchMore
    await act(async () => result.current.advance());

    await waitFor(() => {
        // The CW post should be filtered, only normalPost added to queue
        const allIds = [
            result.current.current?.id,
            ...result.current.queue.map((p) => p.id),
        ].filter(Boolean);
        expect(allIds).not.toContain('cw-fetch');
        expect(allIds).toContain('normal-fetch');
    });
});

it('goBack is a no-op when history is empty', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('1');
});

it('goBack restores the previous post after one advance', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('2');
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('1');
});

it('goBack does not modify the forward queue', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    const queueBefore = result.current.queue.map((p) => p.id);
    act(() => result.current.goBack());
    expect(result.current.queue.map((p) => p.id)).toEqual(queueBefore);
});

it('canGoBack is false when history is empty', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    expect(result.current.canGoBack).toBe(false);
});

it('canGoBack is true after advancing at least once', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    expect(result.current.canGoBack).toBe(true);
});

it('canGoBack returns to false once history is exhausted by goBack', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    act(() => result.current.goBack());
    expect(result.current.canGoBack).toBe(false);
});

it('caps history at 50 posts', () => {
    const posts = Array.from({ length: 60 }, (_, i) => makePost(String(i)));
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );

    for (let i = 0; i < 55; i++) {
        act(() => result.current.advance());
    }

    for (let i = 0; i < 50; i++) {
        act(() => result.current.goBack());
    }

    const idBefore = result.current.current?.id;
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe(idBefore);
});
