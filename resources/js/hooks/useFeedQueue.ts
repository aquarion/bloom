import { router } from '@inertiajs/react';
import axios from 'axios';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { FeedResponse, Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';

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
    initialPosts,
    initialCursor,
    cwBehavior = 'blur' as ContentBehavior,
    sensitiveMediaBehavior = 'blur' as ContentBehavior,
}: {
    initialPosts: Post[];
    initialCursor: string | null;
    cwBehavior?: ContentBehavior;
    sensitiveMediaBehavior?: ContentBehavior;
}) {
    const filterPost = useCallback(
        (post: Post) =>
            !shouldSkipPost(post, cwBehavior, sensitiveMediaBehavior),
        [cwBehavior, sensitiveMediaBehavior],
    );

    const filteredInitial = initialPosts.filter(filterPost);

    const [state, dispatch] = useReducer(reducer, {
        current: filteredInitial[0] ?? null,
        queue: filteredInitial.slice(1),
        cursor: initialCursor,
    });

    const fetchingRef = useRef(false);

    const fetchMore = useCallback(
        async (activeCursor: string) => {
            if (fetchingRef.current) {
                return;
            }

            fetchingRef.current = true;

            try {
                const { data } = await axios.get<FeedResponse>('/feed', {
                    params: { cursor: activeCursor },
                    headers: { Accept: 'application/json' },
                });
                dispatch({
                    type: 'enqueue',
                    posts: data.posts.filter(filterPost),
                    cursor: data.next_cursor,
                });
            } catch (error) {
                const status = axios.isAxiosError(error)
                    ? error.response?.status
                    : undefined;

                if (status === 401 || status === 419) {
                    router.visit('/login');
                } else {
                    console.error(
                        '[useFeedQueue] Failed to fetch more posts',
                        error,
                    );
                }
            } finally {
                fetchingRef.current = false;
            }
        },
        [filterPost],
    );

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
