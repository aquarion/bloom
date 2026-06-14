import { useCallback, useMemo, useReducer } from 'react';
import type { Post } from '@/types/post';

type State = { current: Post | null; queue: Post[] };

function makeReducer(initialPosts: Post[]) {
    return (state: State): State => {
        if (state.queue.length === 0) {
            return {
                current: initialPosts[0] ?? null,
                queue: initialPosts.slice(1),
            };
        }

        const [next, ...rest] = state.queue;

        return {
            current: next,
            queue: state.current ? [...rest, state.current] : rest,
        };
    };
}

export function useWelcomeQueue(initialPosts: Post[]) {
    // useMemo ensures the reducer function is stable across renders.
    // initialPosts is the initial-data prop and does not change after mount.
    const reducer = useMemo(() => makeReducer(initialPosts), [initialPosts]);
    const [state, dispatch] = useReducer(reducer, {
        current: initialPosts[0] ?? null,
        queue: initialPosts.slice(1),
    });

    const advance = useCallback(() => dispatch(), []);

    return { current: state.current, queue: state.queue, advance };
}
