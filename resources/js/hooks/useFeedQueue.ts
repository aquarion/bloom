import { router } from '@inertiajs/react';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { FeedResponse, Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';

const REFILL_THRESHOLD = 5;
const HISTORY_CAP = 50;

type State = {
    path: Post[];
    position: number;
    cursor: string | null;
};
type Action =
    | { type: 'advance' }
    | { type: 'go_back' }
    | { type: 'skip_to'; postId: string }
    | { type: 'enqueue'; posts: Post[]; cursor: string | null };

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
            const seen = new Set<string>([
                ...(currentPost ? [currentPost.id] : []),
                ...queuePosts.map((p) => p.id),
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
            const merged = [...queuePosts, ...incoming];
            const historyPart = state.path.slice(0, state.position);

            if (currentPost === null) {
                if (merged.length === 0) {
                    return { ...state, cursor: action.cursor };
                }

                return {
                    ...state,
                    path: [...historyPart, ...merged],
                    position: historyPart.length,
                    cursor: action.cursor,
                };
            }

            return {
                ...state,
                path: [...historyPart, currentPost, ...merged],
                cursor: action.cursor,
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
    'use no memo';

    const filterPost = useCallback(
        (post: Post) =>
            !shouldSkipPost(post, cwBehavior, sensitiveMediaBehavior),
        [cwBehavior, sensitiveMediaBehavior],
    );

    const filteredInitial = initialPosts.filter(filterPost);

    const [state, dispatch] = useReducer(reducer, {
        path: filteredInitial,
        position: 0,
        cursor: initialCursor,
    });

    const current = state.path[state.position] ?? null;
    const queue = useMemo(
        () => state.path.slice(state.position + 1),
        [state.path, state.position],
    );

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
        if (queue.length <= REFILL_THRESHOLD && state.cursor) {
            fetchMore(state.cursor);
        }
    }, [queue.length, state.cursor, fetchMore]);

    const advance = useCallback(() => {
        dispatch({ type: 'advance' });
    }, []);

    const goBack = useCallback(() => {
        dispatch({ type: 'go_back' });
    }, []);

    const skipTo = useCallback((postId: string) => {
        dispatch({ type: 'skip_to', postId });
    }, []);

    return {
        current,
        queue,
        advance,
        goBack,
        skipTo,
        canGoBack: state.position > 0,
    };
}
