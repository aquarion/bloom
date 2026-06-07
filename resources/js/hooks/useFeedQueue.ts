import { router } from '@inertiajs/react';
import axios from 'axios';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { FeedResponse, Post } from '@/types/post';

const REFILL_THRESHOLD = 5;

type State = { current: Post | null; queue: Post[]; cursor: string | null };
type Action =
    | { type: 'advance' }
    | { type: 'enqueue'; posts: Post[]; cursor: string | null };

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'advance': {
            const [next, ...rest] = state.queue;

            return { ...state, current: next ?? null, queue: rest };
        }

        case 'enqueue': {
            const seen = new Set<string>([
                ...(state.current ? [state.current.id] : []),
                ...state.queue.map((p) => p.id),
            ]);
            // New posts are sorted newest-first among themselves, then appended
            // after the existing queue so already-buffered posts are never skipped.
            const incoming = action.posts
                .filter((p) => {
                    if (seen.has(p.id)) {
                        return false;
                    }

                    seen.add(p.id);

                    return true;
                })
                .sort((a, b) => b.created_at.localeCompare(a.created_at));
            const merged = [...state.queue, ...incoming];

            // If current drained to null (e.g. fetchMore lagged behind advances),
            // promote the first incoming post automatically.
            if (state.current === null && merged.length > 0) {
                return {
                    current: merged[0],
                    queue: merged.slice(1),
                    cursor: action.cursor,
                };
            }

            return { ...state, queue: merged, cursor: action.cursor };
        }
    }
}

export function useFeedQueue({
    initialPosts,
    initialCursor,
}: {
    initialPosts: Post[];
    initialCursor: string | null;
}) {
    const [state, dispatch] = useReducer(reducer, {
        current: initialPosts[0] ?? null,
        queue: initialPosts.slice(1),
        cursor: initialCursor,
    });

    const fetching = useRef(false);

    const fetchMore = useCallback(async (activeCursor: string) => {
        if (fetching.current) {
            return;
        }

        fetching.current = true;

        try {
            const { data } = await axios.get<FeedResponse>('/feed', {
                params: { cursor: activeCursor },
                headers: { Accept: 'application/json' },
            });
            dispatch({
                type: 'enqueue',
                posts: data.posts,
                cursor: data.next_cursor,
            });
        } catch (error) {
            const status = axios.isAxiosError(error)
                ? error.response?.status
                : undefined;

            if (status === 401 || status === 419) {
                router.visit('/login');
            }
        } finally {
            fetching.current = false;
        }
    }, []);

    useEffect(() => {
        if (state.queue.length <= REFILL_THRESHOLD && state.cursor) {
            fetchMore(state.cursor);
        }
    }, [state.queue.length, state.cursor, fetchMore]);

    const advance = useCallback(() => {
        dispatch({ type: 'advance' });
    }, []);

    return { current: state.current, queue: state.queue, advance };
}
