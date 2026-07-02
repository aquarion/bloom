import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Post } from '@/types/post';
import { useWelcomeQueue } from './useWelcomeQueue';

function makePost(id: string): Post {
    return {
        id,
        source: 'mastodon',
        source_handle: '',
        source_instance: null,
        author_name: 'Test',
        author_handle: '@test@example.com',
        author_avatar: '',
        author_banner: null,
        body: `Post ${id}`,
        media: [],
        created_at: '2024-01-01T00:00:00.000Z',
        original_url: '',
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
        cw_is_author_level: false,
        sensitive_media: false,
    };
}

const posts = [makePost('a'), makePost('b'), makePost('c')];

describe('useWelcomeQueue', () => {
    it('initialises with the first post as current', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        expect(result.current.current?.id).toBe('a');
    });

    it('initialises queue with the remaining posts', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        expect(result.current.queue.map((p) => p.id)).toEqual(['b', 'c']);
    });

    it('advance moves queue[0] to current', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        act(() => result.current.advance());
        expect(result.current.current?.id).toBe('b');
        expect(result.current.queue.map((p) => p.id)).toEqual(['c', 'a']);
    });

    it('loops back to the start when queue is exhausted', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        act(() => result.current.advance()); // a → b
        act(() => result.current.advance()); // b → c
        act(() => result.current.advance()); // c → a (loop)
        expect(result.current.current?.id).toBe('a');
        expect(result.current.queue.map((p) => p.id)).toEqual(['b', 'c']);
    });

    it('handles a single-post list by looping back to it', () => {
        const { result } = renderHook(() =>
            useWelcomeQueue([makePost('only')]),
        );
        act(() => result.current.advance());
        expect(result.current.current?.id).toBe('only');
    });
});
