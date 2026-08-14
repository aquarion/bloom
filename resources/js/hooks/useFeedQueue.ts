import { router } from '@inertiajs/react';
import axios from 'axios';
import {
    useCallback,
    useEffect,
    useMemo,
    useReducer,
    useRef,
    useState,
} from 'react';
import { dedupeAgainstHistory } from '@/lib/feedDedup';
import type { FeedResponse, Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';

const REFILL_THRESHOLD = 5;
const HISTORY_CAP = 50;
// Bounds retries for an account whose fetch keeps erroring — without this, a
// persistently-failing account (not just a one-off blip) would retry forever
// on every refill tick, since a failed fetch's cursor deliberately isn't
// treated as "exhausted" (see the enqueue reducer case below).
const MAX_ACCOUNT_RETRIES = 3;

type AccountCursors = Record<number, string | null>;

// Raw per-account outcome of a fetch, before the reducer decides whether it
// should be retried, given up on, or recorded as a successful page.
type AccountResult = {
    accountId: number;
    posts: Post[];
    nextCursor: string | null;
    failed: boolean;
};

type State = {
    path: Post[];
    position: number;
    // Per-account pagination cursor — null means that account is exhausted
    // (no more pages, or it kept failing past MAX_ACCOUNT_RETRIES). An
    // account absent from this map hasn't been fetched yet (only true
    // before the very first batch arrives).
    cursors: AccountCursors;
    // Consecutive fetch failures per account, since the last success. Reset
    // to 0 on success; once it hits MAX_ACCOUNT_RETRIES the account's cursor
    // is set to null so it stops being retried.
    failureCounts: Record<number, number>;
    // Whether the account's most recent fetch attempt errored. Cleared back
    // to false the next time that account fetches successfully. Distinct
    // from failureCounts reaching the retry cap — this just reflects "last
    // attempt didn't work", for UI display.
    failed: Record<number, boolean>;
};
type Action =
    | { type: 'advance' }
    | { type: 'go_back' }
    | { type: 'skip_to'; postId: string }
    | {
          type: 'enqueue';
          posts: Post[];
          results: AccountResult[];
          bufferSize: number;
          // Initial load streams one dispatch per account as each resolves
          // (see the effect below) rather than waiting for all of them —
          // sortedMerge interleaves each arrival into the queue by
          // created_at so that streaming doesn't put an account's older
          // first page ahead of another account's newer one. Refills
          // (fetchMore) always append instead: once something is queued,
          // a later page shouldn't reorder it out from under the user.
          sortedMerge: boolean;
      };

// Both queuePosts and incoming are already sorted newest-first; this
// interleaves them by created_at instead of concatenating, so a streamed
// dispatch from a slower account can't push its content behind an
// already-queued older post from a faster one.
function mergeSortedByDate(a: Post[], b: Post[]): Post[] {
    const merged: Post[] = [];
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
        if (a[i].created_at.localeCompare(b[j].created_at) >= 0) {
            merged.push(a[i++]);
        } else {
            merged.push(b[j++]);
        }
    }

    return [...merged, ...a.slice(i), ...b.slice(j)];
}

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'advance': {
            if (state.position >= state.path.length) {
                return state;
            }

            let position = state.position + 1;
            let path = state.path;

            if (position > HISTORY_CAP) {
                const excess = position - HISTORY_CAP;
                path = path.slice(excess);
                position -= excess;
            }

            return { ...state, path, position };
        }

        case 'go_back': {
            if (state.position === 0) {
                return state;
            }

            return { ...state, position: state.position - 1 };
        }

        // Reorders the queue so the target post is immediately next in line
        // (skipping past whatever was ahead of it) without dropping any
        // posts — the caller then advance()s into it for the transition.
        // Only searches the queue, not history: the current post can't
        // target itself, and re-queuing a past post would resurrect it.
        case 'skip_to': {
            const targetIndex = state.path.findIndex(
                (post, index) =>
                    index > state.position && post.id === action.postId,
            );

            if (targetIndex === -1) {
                return state;
            }

            const path = [...state.path];
            const [target] = path.splice(targetIndex, 1);
            path.splice(state.position + 1, 0, target);

            return { ...state, path };
        }

        case 'enqueue': {
            const currentPost = state.path[state.position] ?? null;
            const queuePosts = state.path.slice(state.position + 1);
            const historyPart = state.path.slice(0, state.position);

            // Dedup against the whole path (history + current + queue), not
            // just this batch — accounts resolve one at a time now, so a
            // duplicate can arrive in a later dispatch than the post it
            // duplicates.
            const incoming = dedupeAgainstHistory(
                action.posts,
                state.path,
                action.bufferSize,
            );
            const merged = action.sortedMerge
                ? mergeSortedByDate(queuePosts, incoming)
                : [...queuePosts, ...incoming];
            const cursors = { ...state.cursors };
            const failureCounts = { ...state.failureCounts };
            const failed = { ...state.failed };

            for (const r of action.results) {
                if (r.failed) {
                    const count = (failureCounts[r.accountId] ?? 0) + 1;
                    failureCounts[r.accountId] = count;
                    failed[r.accountId] = true;
                    cursors[r.accountId] =
                        count >= MAX_ACCOUNT_RETRIES
                            ? null
                            : (r.nextCursor ?? '');
                } else {
                    failureCounts[r.accountId] = 0;
                    failed[r.accountId] = false;
                    cursors[r.accountId] = r.nextCursor;
                }
            }

            if (currentPost === null) {
                if (merged.length === 0) {
                    return { ...state, cursors, failureCounts, failed };
                }

                return {
                    ...state,
                    path: [...historyPart, ...merged],
                    position: historyPart.length,
                    cursors,
                    failureCounts,
                    failed,
                };
            }

            return {
                ...state,
                path: [...historyPart, currentPost, ...merged],
                cursors,
                failureCounts,
                failed,
            };
        }
    }
}

function shouldSkipPost(
    post: Post,
    cwBehavior: ContentBehavior,
    sensitiveMediaBehavior: ContentBehavior,
): boolean {
    if (post.cw_text !== null && cwBehavior === 'skip') {
        return true;
    }

    if (post.sensitive_media && sensitiveMediaBehavior === 'skip') {
        return true;
    }

    return false;
}

export function useFeedQueue({
    accounts,
    cwBehavior = 'blur' as ContentBehavior,
    sensitiveMediaBehavior = 'blur' as ContentBehavior,
    // Mirrors config/feed.php's buffer_size default; callers with access to
    // that config (see feed.tsx) should pass it through so the client-side
    // memory ceiling stays in sync with the server's.
    bufferSize = 200,
}: {
    accounts: { id: number }[];
    cwBehavior?: ContentBehavior;
    sensitiveMediaBehavior?: ContentBehavior;
    bufferSize?: number;
}) {
    'use no memo';

    const filterPost = useCallback(
        (post: Post) =>
            !shouldSkipPost(post, cwBehavior, sensitiveMediaBehavior),
        [cwBehavior, sensitiveMediaBehavior],
    );

    const [state, dispatch] = useReducer(reducer, {
        path: [],
        position: 0,
        cursors: {},
        failureCounts: {},
        failed: {},
    });

    const current = state.path[state.position] ?? null;
    const queue = useMemo(
        () => state.path.slice(state.position + 1),
        [state.path, state.position],
    );

    const [loadedAccounts, setLoadedAccounts] = useState(0);
    const totalAccounts = accounts.length;

    const fetchAccount = useCallback(
        async (
            accountId: number,
            cursor: string | null,
        ): Promise<AccountResult> => {
            try {
                const { data } = await axios.get<FeedResponse>(
                    `/feed/accounts/${accountId}`,
                    {
                        params: cursor ? { cursor } : undefined,
                        headers: { Accept: 'application/json' },
                    },
                );

                return {
                    accountId,
                    posts: data.posts,
                    nextCursor: data.next_cursor,
                    failed: false,
                };
            } catch (error) {
                const status = axios.isAxiosError(error)
                    ? error.response?.status
                    : undefined;

                if (status === 401 || status === 419) {
                    router.visit('/login');
                } else {
                    console.error(
                        '[useFeedQueue] Failed to fetch account',
                        accountId,
                        error,
                    );
                }

                // Echo back the cursor that was attempted — the reducer
                // decides whether to retry it or give up, since only it
                // knows this account's recent failure history.
                return {
                    accountId,
                    posts: [],
                    nextCursor: cursor,
                    failed: true,
                };
            }
        },
        [],
    );

    const fetchingRef = useRef(false);

    const fetchMore = useCallback(
        // Promise chaining rather than async/await + try/finally — the
        // React Compiler can't lower a try without a catch clause.
        (cursors: AccountCursors) => {
            if (fetchingRef.current) {
                return;
            }

            const active = Object.entries(cursors).filter(
                (entry): entry is [string, string] => entry[1] !== null,
            );

            if (active.length === 0) {
                return;
            }

            fetchingRef.current = true;

            return Promise.all(
                active.map(([accountId, cursor]) =>
                    fetchAccount(Number(accountId), cursor),
                ),
            )
                .then((results) => {
                    const posts = results.flatMap((r) =>
                        r.posts.filter(filterPost),
                    );
                    // Append, not sortedMerge: once something's queued, a
                    // refill page shouldn't reorder it out from under the
                    // user even if the new page happens to skew newer.
                    dispatch({
                        type: 'enqueue',
                        posts,
                        results,
                        bufferSize,
                        sortedMerge: false,
                    });
                })
                .finally(() => {
                    fetchingRef.current = false;
                });
        },
        [fetchAccount, filterPost, bufferSize],
    );

    // Initial load: fan out one request per connected account and dispatch
    // each as it resolves, instead of waiting on every account before
    // showing anything — the point is to not let one slow account hold up
    // first paint. sortedMerge interleaves each arrival by created_at so a
    // slower account's result still lands in the right chronological spot.
    // loadedAccounts/totalAccounts let the UI show real progress meanwhile.
    useEffect(() => {
        if (accounts.length === 0) {
            return;
        }

        let cancelled = false;

        for (const account of accounts) {
            fetchAccount(account.id, null).then((result) => {
                if (cancelled) {
                    return;
                }

                setLoadedAccounts((n) => n + 1);

                const posts = result.posts.filter(filterPost);
                dispatch({
                    type: 'enqueue',
                    posts,
                    results: [result],
                    bufferSize,
                    sortedMerge: true,
                });
            });
        }

        return () => {
            cancelled = true;
        };
        // fetchAccount/filterPost are deliberately omitted: including them
        // would also re-run this effect (and refetch everything) whenever
        // cwBehavior/sensitiveMediaBehavior change, which should only
        // re-filter already-loaded posts, not restart the fetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
    }, [accounts]);

    useEffect(() => {
        if (queue.length <= REFILL_THRESHOLD) {
            fetchMore(state.cursors);
        }
    }, [queue.length, state.cursors, fetchMore]);

    const advance = useCallback(() => {
        dispatch({ type: 'advance' });
    }, []);

    const goBack = useCallback(() => {
        dispatch({ type: 'go_back' });
    }, []);

    const skipTo = useCallback((postId: string) => {
        dispatch({ type: 'skip_to', postId });
    }, []);

    const failedAccounts = useMemo(
        () => Object.values(state.failed).filter(Boolean).length,
        [state.failed],
    );

    return {
        current,
        queue,
        advance,
        goBack,
        skipTo,
        canGoBack: state.position > 0,
        loadedAccounts,
        totalAccounts,
        failedAccounts,
    };
}
