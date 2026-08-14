import { router } from '@inertiajs/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import axios from 'axios';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { useFeedQueue } from './useFeedQueue';

vi.mock('axios');
vi.mock('@inertiajs/react', () => ({
    router: {
        visit: vi.fn(),
    },
}));

// Posts get merged/deduped through dedupePosts(), which sorts by created_at —
// a real-clock default here would make call order vs. sort order flaky
// whenever two calls straddle a millisecond boundary. Each call without an
// explicit created_at gets a timestamp one second older than the last, so
// bare `makePost(id)` calls sort in the order they were made, deterministically.
let nextPostSequence = 0;
const BASE_POST_TIME = Date.parse('2026-06-01T12:00:00Z');

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
    created_at:
        created_at ??
        new Date(BASE_POST_TIME - nextPostSequence++ * 1000).toISOString(),
    original_url: `https://example.com/${id}`,
    link_url: null,
    link_title: null,
    link_description: null,
    link_image: null,
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

const oneAccount = [{ id: 1 }];

type GetConfig = { params?: { cursor?: string } };
type GetResponse = { data: { posts: Post[]; next_cursor: string | null } };

// The low-queue refill effect can fire as soon as the queue is under
// threshold — not necessarily only right after an explicit advance() call —
// so tests that need a distinct "initial load" vs. "refill" response key
// off the cursor param itself rather than call order, which stays correct
// regardless of exactly when the refill fires.
function mockAccountResponses(initial: GetResponse, refill: GetResponse) {
    vi.mocked(axios.get).mockImplementation(((
        _url: string,
        config?: GetConfig,
    ) => Promise.resolve(config?.params?.cursor ? refill : initial)) as never);
}

beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.isAxiosError).mockReset();
    vi.mocked(router.visit).mockClear();
});

it('loads posts from a single connected account', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [
                makePost('1', '2026-06-01T12:00:00Z'),
                makePost('2', '2026-06-01T11:00:00Z'),
            ],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    expect(result.current.queue).toHaveLength(1);
    expect(axios.get).toHaveBeenCalledWith('/feed/accounts/1', {
        params: undefined,
        headers: { Accept: 'application/json' },
    });
});

it('renders nothing when there are no connected accounts', () => {
    const { result } = renderHook(() => useFeedQueue({ accounts: [] }));

    expect(result.current.current).toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
});

it('fires one request per account and merges the results', async () => {
    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: {
                    posts: [makePost('a1', '2026-06-01T12:00:00Z')],
                    next_cursor: null,
                },
            });
        }

        return Promise.resolve({
            data: {
                posts: [makePost('a2', '2026-06-01T11:00:00Z')],
                next_cursor: null,
            },
        });
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.totalAccounts).toBe(2));
    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));

    const ids = [
        result.current.current?.id,
        ...result.current.queue.map((p) => p.id),
    ];
    expect(ids).toEqual(['a1', 'a2']);
});

it('tracks loadedAccounts as each account settles, independent of totalAccounts', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [], next_cursor: null },
    });

    const threeAccounts = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: threeAccounts }),
    );

    expect(result.current.totalAccounts).toBe(3);
    await waitFor(() => expect(result.current.loadedAccounts).toBe(3));
});

it('deduplicates cross-account posts by original_url when merging the initial batch', async () => {
    const shared = makePost('dup', '2026-06-01T12:00:00Z');

    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: { posts: [shared], next_cursor: null },
            });
        }

        return Promise.resolve({
            data: { posts: [shared], next_cursor: null },
        });
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));
    expect(result.current.current?.id).toBe('dup');
    expect(result.current.queue).toHaveLength(0);
});

it("shows the first account's post without waiting for a slower account to resolve", async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    const second = new Promise((resolve) => {
        resolveSecond = resolve;
    });

    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: {
                    posts: [makePost('fast', '2026-06-01T12:00:00Z')],
                    next_cursor: null,
                },
            });
        }

        return second.then(() => ({
            data: {
                posts: [makePost('slow', '2026-06-01T11:00:00Z')],
                next_cursor: null,
            },
        }));
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('fast'));
    // Account 2's fetch is still pending — the first account's post rendered
    // without waiting for it.
    expect(result.current.loadedAccounts).toBe(1);

    resolveSecond(undefined);
    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));
});

it("interleaves a slower account's post into the correct chronological position once it resolves", async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    const second = new Promise((resolve) => {
        resolveSecond = resolve;
    });

    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: {
                    posts: [
                        makePost('a-new', '2026-06-01T12:00:00Z'),
                        makePost('a-old', '2026-06-01T09:00:00Z'),
                    ],
                    next_cursor: null,
                },
            });
        }

        return second.then(() => ({
            data: {
                posts: [makePost('b-mid', '2026-06-01T10:30:00Z')],
                next_cursor: null,
            },
        }));
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('a-new'));
    expect(result.current.queue.map((p) => p.id)).toEqual(['a-old']);

    resolveSecond(undefined);

    // b-mid (10:30) belongs between a-new (12:00, already current) and
    // a-old (09:00) — a plain append would have put it after a-old instead.
    await waitFor(() =>
        expect(result.current.queue.map((p) => p.id)).toEqual([
            'b-mid',
            'a-old',
        ]),
    );
});

it('preserves a skipTo-reordered queue when a later streamed dispatch interleaves new posts', async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    const second = new Promise((resolve) => {
        resolveSecond = resolve;
    });

    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: {
                    posts: [
                        makePost('x-new', '2026-06-01T12:00:00Z'),
                        makePost('x-mid', '2026-06-01T10:00:00Z'),
                        makePost('x-old', '2026-06-01T08:00:00Z'),
                    ],
                    next_cursor: null,
                },
            });
        }

        return second.then(() => ({
            data: {
                posts: [makePost('y-new', '2026-06-01T11:00:00Z')],
                next_cursor: null,
            },
        }));
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('x-new'));
    expect(result.current.queue.map((p) => p.id)).toEqual(['x-mid', 'x-old']);

    // User jumps to x-old before account 2 has resolved, reordering the
    // queue out of chronological order.
    act(() => result.current.skipTo('x-old'));
    expect(result.current.queue.map((p) => p.id)).toEqual(['x-old', 'x-mid']);

    resolveSecond(undefined);
    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));

    // The skipTo-established order must survive the later streamed merge —
    // y-new gets slotted in without disturbing x-old-before-x-mid.
    const ids = result.current.queue.map((p) => p.id);
    expect(ids.indexOf('x-old')).toBeLessThan(ids.indexOf('x-mid'));
    expect(ids).toContain('y-new');
});

it('deduplicates a post that arrives from a second account after the first has already been queued', async () => {
    const shared = makePost('dup', '2026-06-01T12:00:00Z');
    let resolveSecond: (value: unknown) => void = () => {};
    const second = new Promise((resolve) => {
        resolveSecond = resolve;
    });

    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: { posts: [shared], next_cursor: null },
            });
        }

        return second.then(() => ({
            data: { posts: [shared], next_cursor: null },
        }));
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('dup'));

    resolveSecond(undefined);
    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));

    expect(result.current.queue).toHaveLength(0);
});

it('caps the merged queue to bufferSize across combined per-account batches', async () => {
    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: {
                    posts: [
                        makePost('a1', '2026-06-01T12:00:00Z'),
                        makePost('a2', '2026-06-01T11:00:00Z'),
                    ],
                    next_cursor: null,
                },
            });
        }

        return Promise.resolve({
            data: {
                posts: [
                    makePost('b1', '2026-06-01T10:00:00Z'),
                    makePost('b2', '2026-06-01T09:00:00Z'),
                ],
                next_cursor: null,
            },
        });
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts, bufferSize: 2 }),
    );

    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));

    // Neither account's own batch (2 posts) exceeds bufferSize on its own —
    // this only fails if the cap is applied per streamed batch instead of
    // to the combined queue.
    expect(result.current.queue).toHaveLength(2);
    expect(result.current.queue.map((p) => p.id)).not.toContain('b2');
});

it('handles a refill firing while a slower account is still streaming into the initial load', async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    const second = new Promise((resolve) => {
        resolveSecond = resolve;
    });

    vi.mocked(axios.get).mockImplementation((url, config) => {
        const cursor = (config as GetConfig | undefined)?.params?.cursor;

        if (url === '/feed/accounts/1') {
            if (cursor === 'cursor1') {
                return Promise.resolve({
                    data: {
                        posts: [makePost('a1-page2', '2026-06-01T08:00:00Z')],
                        next_cursor: null,
                    },
                });
            }

            return Promise.resolve({
                data: {
                    posts: [makePost('a1', '2026-06-01T12:00:00Z')],
                    next_cursor: 'cursor1',
                },
            });
        }

        // Account 2 is deferred so it resolves after account 1's refill.
        return second.then(() => ({
            data: {
                posts: [makePost('b1', '2026-06-01T10:00:00Z')],
                next_cursor: null,
            },
        }));
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('a1'));

    // The refill fires automatically (queue is under REFILL_THRESHOLD) while
    // account 2 is still pending — let it land first.
    await waitFor(() =>
        expect(result.current.queue.map((p) => p.id)).toContain('a1-page2'),
    );

    resolveSecond(undefined);
    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));

    // b1 (10:00) should be correctly interleaved ahead of a1-page2 (08:00)
    // despite the refill's append landing in between the two streamed
    // initial-load dispatches — nothing got dropped or corrupted.
    expect(result.current.queue.map((p) => p.id)).toEqual(['b1', 'a1-page2']);
    expect(result.current.current?.id).toBe('a1');
});

it('interleaves three accounts resolving out of order into correct chronological order', async () => {
    let resolveFirst: (value: unknown) => void = () => {};
    const first = new Promise((resolve) => {
        resolveFirst = resolve;
    });
    let resolveThird: (value: unknown) => void = () => {};
    const third = new Promise((resolve) => {
        resolveThird = resolve;
    });

    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return first.then(() => ({
                data: {
                    posts: [makePost('p1', '2026-06-01T10:00:00Z')],
                    next_cursor: null,
                },
            }));
        }

        if (url === '/feed/accounts/2') {
            return Promise.resolve({
                data: {
                    posts: [makePost('p2', '2026-06-01T12:00:00Z')],
                    next_cursor: null,
                },
            });
        }

        return third.then(() => ({
            data: {
                posts: [makePost('p3', '2026-06-01T11:00:00Z')],
                next_cursor: null,
            },
        }));
    });

    const threeAccounts = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: threeAccounts }),
    );

    // Account 2 resolves fastest, becomes current immediately.
    await waitFor(() => expect(result.current.current?.id).toBe('p2'));

    resolveThird(undefined);
    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));

    resolveFirst(undefined);
    await waitFor(() => expect(result.current.loadedAccounts).toBe(3));

    // p2 (12:00) is current; p3 (11:00) then p1 (10:00) queue in
    // chronological order despite resolving in the order 2, 3, 1.
    expect(result.current.queue.map((p) => p.id)).toEqual(['p3', 'p1']);
});

it('dequeues the head of the queue', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));

    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('2');
    expect(result.current.queue).toHaveLength(1);
});

it('fetches more posts from accounts that still have a cursor when the queue drops to 5', async () => {
    const posts = Array.from({ length: 6 }, (_, i) => makePost(String(i)));

    mockAccountResponses(
        { data: { posts, next_cursor: 'cursor123' } },
        {
            data: {
                posts: [makePost('extra1'), makePost('extra2')],
                next_cursor: null,
            },
        },
    );

    renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() =>
        expect(axios.get).toHaveBeenCalledWith('/feed/accounts/1', {
            params: { cursor: 'cursor123' },
            headers: { Accept: 'application/json' },
        }),
    );
});

it('does not refetch an account once it reports next_cursor: null', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: Array.from({ length: 6 }, (_, i) => makePost(String(i))),
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('0'));

    const callsBefore = vi.mocked(axios.get).mock.calls.length;
    await act(async () => result.current.advance());
    expect(vi.mocked(axios.get).mock.calls.length).toBe(callsBefore);
});

it('deduplicates posts already in the queue and the current post when a refill batch arrives', async () => {
    // post "1" is current, "2" is in queue — both should be excluded from the incoming batch
    mockAccountResponses(
        {
            data: {
                posts: [
                    makePost('1', '2026-06-01T12:00:00Z'),
                    makePost('2', '2026-06-01T11:00:00Z'),
                ],
                next_cursor: 'cursor123',
            },
        },
        {
            data: {
                posts: [
                    makePost('1', '2026-06-01T12:00:00Z'),
                    makePost('2', '2026-06-01T11:00:00Z'),
                    makePost('3', '2026-06-01T10:00:00Z'),
                ],
                next_cursor: null,
            },
        },
    );

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.queue).toHaveLength(2));

    const ids = [
        result.current.current?.id,
        ...result.current.queue.map((p) => p.id),
    ];
    expect(ids).toEqual(['1', '2', '3']);
});

it('appends incoming posts after existing queue to avoid skipping buffered posts', async () => {
    mockAccountResponses(
        {
            data: {
                posts: [
                    makePost('mid', '2026-06-01T10:00:00Z'),
                    makePost('old', '2026-06-01T09:00:00Z'),
                ],
                next_cursor: 'cursor123',
            },
        },
        {
            data: {
                posts: [makePost('new', '2026-06-01T12:00:00Z')],
                next_cursor: null,
            },
        },
    );

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.queue).toHaveLength(2));
    expect(result.current.queue.map((p) => p.id)).toEqual(['old', 'new']);
});

it('advancing past the end of the queue sets current to null, and further advance is a no-op', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('1'), makePost('2')], next_cursor: null },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));

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
    mockAccountResponses(
        { data: { posts: [], next_cursor: 'cursor123' } },
        { data: { posts: [makePost('1'), makePost('2')], next_cursor: null } },
    );

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    expect(result.current.queue.map((p) => p.id)).toEqual(['2']);
});

it('stays exhausted when a refill while current is null returns no posts', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [], next_cursor: null },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(1));
    expect(result.current.current).toBeNull();
    expect(result.current.queue).toHaveLength(0);
});

it('goBack still walks back to the correct pre-enqueue post after an enqueue at a non-zero position', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
            posts: Array.from({ length: 7 }, (_, i) => makePost(String(i))),
            next_cursor: 'cursor123',
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('0'));

    vi.mocked(axios.get).mockResolvedValueOnce({
        data: { posts: [makePost('new')], next_cursor: null },
    });

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

it('redirects to login when an account fetch gets unauthenticated', async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.get).mockRejectedValue({
        isAxiosError: true,
        response: { status: 401 },
    });

    renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await act(async () => Promise.resolve());

    expect(router.visit).toHaveBeenCalledWith('/login');
});

it('redirects to login when an account fetch gets an expired session (419)', async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(true);
    vi.mocked(axios.get).mockRejectedValue({
        isAxiosError: true,
        response: { status: 419 },
    });

    renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await act(async () => Promise.resolve());

    expect(router.visit).toHaveBeenCalledWith('/login');
});

it('marks an account as failed without discarding results from accounts that succeeded', async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    vi.mocked(axios.get).mockImplementation((url) => {
        if (url === '/feed/accounts/1') {
            return Promise.resolve({
                data: {
                    posts: [makePost('ok1', '2026-06-01T12:00:00Z')],
                    next_cursor: null,
                },
            });
        }

        return Promise.reject(new Error('network error'));
    });

    const twoAccounts = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
        useFeedQueue({ accounts: twoAccounts }),
    );

    await waitFor(() => expect(result.current.loadedAccounts).toBe(2));
    expect(result.current.current?.id).toBe('ok1');
    expect(result.current.failedAccounts).toBe(1);
});

it('retries a failed account on the next fetch instead of permanently treating it as exhausted', async () => {
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    let calls = 0;
    vi.mocked(axios.get).mockImplementation(() => {
        calls++;

        if (calls === 1) {
            return Promise.reject(new Error('network error'));
        }

        return Promise.resolve({
            data: { posts: [makePost('recovered')], next_cursor: null },
        });
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    // The empty queue (0 <= REFILL_THRESHOLD) triggers an automatic refill —
    // it should retry account 1 rather than treating the failure's cursor as
    // "exhausted" and never fetching it again.
    await waitFor(() => expect(result.current.current?.id).toBe('recovered'));
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.current.failedAccounts).toBe(0);
});

it('skips posts with cw_text when cwBehavior is skip', async () => {
    const cwPost = makePost('cw1');
    cwPost.cw_text = 'Content warning';

    const normalPost = makePost('normal1');

    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [cwPost, normalPost], next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({
            accounts: oneAccount,
            cwBehavior: 'skip',
            sensitiveMediaBehavior: 'show',
        }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('normal1'));
    expect(result.current.queue).toHaveLength(0);
});

it('skips posts with sensitive_media when sensitiveMediaBehavior is skip', async () => {
    const sensitivePost = makePost('sensitive1');
    sensitivePost.sensitive_media = true;

    const normalPost = makePost('normal2');

    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [sensitivePost, normalPost], next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({
            accounts: oneAccount,
            cwBehavior: 'show',
            sensitiveMediaBehavior: 'skip',
        }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('normal2'));
});

it('does not skip cw posts when cwBehavior is blur', async () => {
    const cwPost = makePost('cw2');
    cwPost.cw_text = 'Spoiler';

    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [cwPost], next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({
            accounts: oneAccount,
            cwBehavior: 'blur',
            sensitiveMediaBehavior: 'show',
        }),
    );

    await waitFor(() => expect(result.current.current?.id).toBe('cw2'));
});

it('filters cw posts from a refill response when cwBehavior is skip', async () => {
    const normalPost = makePost('normal-fetch');
    const cwPost = makePost('cw-fetch');
    cwPost.cw_text = 'Spoiler content';

    mockAccountResponses(
        {
            data: {
                posts: Array.from({ length: 6 }, (_, i) =>
                    makePost(`init-${i}`),
                ),
                next_cursor: 'cursor123',
            },
        },
        { data: { posts: [cwPost, normalPost], next_cursor: null } },
    );

    const { result } = renderHook(() =>
        useFeedQueue({
            accounts: oneAccount,
            cwBehavior: 'skip',
            sensitiveMediaBehavior: 'show',
        }),
    );

    await waitFor(() => {
        const allIds = [
            result.current.current?.id,
            ...result.current.queue.map((p) => p.id),
        ].filter(Boolean);
        expect(allIds).not.toContain('cw-fetch');
        expect(allIds).toContain('normal-fetch');
    });
});

it('goBack is a no-op when history is empty', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('1'), makePost('2')], next_cursor: null },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('1');
});

it('goBack restores the previous post after one advance', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('2');
    act(() => result.current.goBack());
    expect(result.current.current?.id).toBe('1');
});

it('goBack restores the departed post to the front of the queue', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.advance());
    act(() => result.current.goBack());
    expect(result.current.queue.map((p) => p.id)).toEqual(['2', '3']);
});

it('canGoBack is false when history is empty', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('1'), makePost('2')], next_cursor: null },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    expect(result.current.canGoBack).toBe(false);
});

it('canGoBack is true after advancing at least once', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('1'), makePost('2')], next_cursor: null },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.advance());
    expect(result.current.canGoBack).toBe(true);
});

it('goBack then advance again restores the original order without dropping posts', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));

    act(() => result.current.advance()); // current: 2, queue: [3]
    act(() => result.current.goBack()); // current: 1, queue should become [2, 3]
    act(() => result.current.advance()); // current: 2, queue: [3]

    expect(result.current.current?.id).toBe('2');
    expect(result.current.queue.map((p) => p.id)).toEqual(['3']);
});

it('canGoBack returns to false once history is exhausted by goBack', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('1'), makePost('2')], next_cursor: null },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.advance());
    act(() => result.current.goBack());
    expect(result.current.canGoBack).toBe(false);
});

it('skipTo reorders the target post to the front of the queue', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3'), makePost('4')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.skipTo('3'));

    expect(result.current.current?.id).toBe('1');
    expect(result.current.queue.map((p) => p.id)).toEqual(['3', '2', '4']);
});

it('skipTo followed by advance moves straight to the target post', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3'), makePost('4')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.skipTo('3'));
    act(() => result.current.advance());

    expect(result.current.current?.id).toBe('3');
    expect(result.current.queue.map((p) => p.id)).toEqual(['2', '4']);
});

it('skipTo targeting the current post is a no-op', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.skipTo('1'));

    expect(result.current.current?.id).toBe('1');
    expect(result.current.queue.map((p) => p.id)).toEqual(['2', '3']);
});

it('skipTo targeting a post already in history is a no-op', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: [makePost('1'), makePost('2'), makePost('3')],
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.advance()); // current: '2', history: ['1']
    act(() => result.current.skipTo('1'));

    expect(result.current.current?.id).toBe('2');
    expect(result.current.queue.map((p) => p.id)).toEqual(['3']);
});

it('skipTo targeting an unknown post id is a no-op', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: [makePost('1'), makePost('2')], next_cursor: null },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('1'));
    act(() => result.current.skipTo('does-not-exist'));

    expect(result.current.current?.id).toBe('1');
    expect(result.current.queue.map((p) => p.id)).toEqual(['2']);
});

it('caps history at 50 posts', async () => {
    vi.mocked(axios.get).mockResolvedValue({
        data: {
            posts: Array.from({ length: 60 }, (_, i) => makePost(String(i))),
            next_cursor: null,
        },
    });

    const { result } = renderHook(() => useFeedQueue({ accounts: oneAccount }));

    await waitFor(() => expect(result.current.current?.id).toBe('0'));

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
