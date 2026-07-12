import { useReducer } from 'react';
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
    const reducer = makeReducer(initialPosts);
    const [state, dispatch] = useReducer(reducer, {
        current: initialPosts[0] ?? null,
        queue: initialPosts.slice(1),
    });

    const advance = () => dispatch();

    return { current: state.current, queue: state.queue, advance };
}
