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
    source_instance: null,
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
    link_youtube_id: null,
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
    cw_is_author_level: false,
    cw_label_source: null,
    cw_category: null,
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

it('advancing past the end of the queue sets current to null, and further advance is a no-op', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );

    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('2');

    act(() => result.current.advance());
    expect(result.current.current).toBeNull();
    expect(result.current.queue).toHaveLength(0);

    act(() => result.current.advance());
    expect(result.current.current).toBeNull();
    expect(result.current.canGoBack).toBe(true);
});

it('restores current from an incoming batch after the feed was exhausted', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('1'), makePost('2')], next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: [], initialCursor: 'cursor123' }),
    );

    expect(result.current.current).toBeNull();

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    expect(result.current.queue.map((p) => p.id)).toEqual(['2']);
});

it('stays exhausted when a refill while current is null returns no posts', async () => {
    vi.mocked(axios.get).mockClear();
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [], next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: [], initialCursor: 'cursor123' }),
    );

    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
    expect(result.current.current).toBeNull();
    expect(result.current.queue).toHaveLength(0);
});

it('goBack still walks back to the correct pre-enqueue post after an enqueue at a non-zero position', async () => {
    const posts = Array.from({ length: 7 }, (_, i) => makePost(String(i)));

    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('new')], next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: 'cursor123' }),
    );

    act(() => result.current.advance()); // current: '1', history: ['0']

    await waitFor(() =>
        expect(result.current.queue.map((p) => p.id)).toContain('new'),
    );

    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('0');
    expect(result.current.queue.map((p) => p.id)).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        'new',
    ]);
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

it('redirects to login when feed refill gets an expired session (419)', async () => {
    const posts = Array.from({ length: 6 }, (_, i) => makePost(String(i)));

    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.get).mockRejectedValue({
        isAxiosError: true,
        response: { status: 419 },
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

it('goBack restores the departed post to the front of the queue', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );
    act(() => result.current.advance());
    act(() => result.current.goBack());
    expect(result.current.queue.map((p) => p.id)).toEqual(['2', '3']);
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

it('goBack then advance again restores the original order without dropping posts', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null }),
    );

    act(() => result.current.advance()); // current: 2, queue: [3]
    act(() => result.current.goBack()); // current: 1, queue should become [2, 3]
    act(() => result.current.advance()); // current: 2, queue: [3]

    expect(result.current.current?.id).toBe('2');
    expect(result.current.queue.map((p) => p.id)).toEqual(['3']);
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

    expect(result.current.current?.id).toBe('55');

    for (let i = 0; i < 50; i++) {
        act(() => result.current.goBack());
    }

    // 5 posts (0-4) should have been trimmed from history once the 50-post
    // cap was exceeded, so going back 50 times lands on post 5, not post 0.
    expect(result.current.current?.id).toBe('5');

    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('5');
});
