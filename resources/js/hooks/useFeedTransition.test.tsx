import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { useFeedTransition } from './useFeedTransition';

type TimelineConfig = { onComplete?: () => void };

let lastTimelineConfig: TimelineConfig | undefined;
let lastCallFn: (() => void) | undefined;

vi.mock('gsap', () => ({
    gsap: {
        timeline: vi.fn((config?: TimelineConfig) => {
            lastTimelineConfig = config;
            const chain = {
                to: vi.fn(() => chain),
                call: vi.fn((fn: () => void) => {
                    lastCallFn = fn;

                    return chain;
                }),
                fromTo: vi.fn(() => chain),
            };

            return chain;
        }),
        set: vi.fn(),
    },
}));

const makePost = (id: string): Post => ({
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
    created_at: new Date().toISOString(),
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
    cw_is_author_level: false,
    cw_label_source: null,
    sensitive_media: false,
});

function Harness({
    current,
    queue,
    advance,
    initialPosts,
}: {
    current: Post | null;
    queue: Post[];
    advance: () => void;
    initialPosts: Post[];
}) {
    const {
        bgRef,
        contentRef,
        nextBackground,
        carouselProgress,
        handleAdvance,
        handleCarouselProgress,
        resetCarouselProgress,
    } = useFeedTransition({ current, queue, advance, initialPosts });

    return (
        <div>
            <div data-testid="bg" ref={bgRef} />
            <div data-testid="content" ref={contentRef} />
            <span data-testid="next-background">
                {nextBackground?.id ?? 'null'}
            </span>
            <span data-testid="carousel-progress">
                {JSON.stringify(carouselProgress)}
            </span>
            <button type="button" onClick={handleAdvance}>
                advance
            </button>
            <button
                type="button"
                onClick={() => handleCarouselProgress(2, 0.5)}
            >
                progress
            </button>
            <button type="button" onClick={resetCarouselProgress}>
                reset
            </button>
        </div>
    );
}

beforeEach(() => {
    lastTimelineConfig = undefined;
    lastCallFn = undefined;
});

describe('useFeedTransition', () => {
    it('seeds nextBackground from the second initial post', () => {
        const postA = makePost('a');
        const postB = makePost('b');
        render(
            <Harness
                current={postA}
                queue={[postB]}
                advance={vi.fn()}
                initialPosts={[postA, postB]}
            />,
        );

        expect(screen.getByTestId('next-background')).toHaveTextContent('b');
    });

    it('updates carouselProgress on handleCarouselProgress and clears it on reset', () => {
        const postA = makePost('a');
        render(
            <Harness
                current={postA}
                queue={[]}
                advance={vi.fn()}
                initialPosts={[postA]}
            />,
        );

        fireEvent.click(screen.getByText('progress'));
        expect(screen.getByTestId('carousel-progress')).toHaveTextContent(
            '{"activeIndex":2,"elapsed":0.5}',
        );

        fireEvent.click(screen.getByText('reset'));
        expect(screen.getByTestId('carousel-progress')).toHaveTextContent(
            'null',
        );
    });

    it('advances the queue and updates nextBackground only once the gsap timeline completes', () => {
        const postA = makePost('a');
        const postB = makePost('b');
        const postC = makePost('c');
        const advance = vi.fn();
        render(
            <Harness
                current={postA}
                queue={[postB, postC]}
                advance={advance}
                initialPosts={[postA, postB]}
            />,
        );

        fireEvent.click(screen.getByText('advance'));
        expect(advance).not.toHaveBeenCalled();
        // Still seeded from initialPosts — the crossfade hasn't completed yet.
        expect(screen.getByTestId('next-background')).toHaveTextContent('b');

        act(() => lastCallFn?.());
        expect(advance).toHaveBeenCalledOnce();

        act(() => lastTimelineConfig?.onComplete?.());
        expect(screen.getByTestId('next-background')).toHaveTextContent('c');
    });

    it('does not update nextBackground if advance() throws inside the call step', () => {
        const postA = makePost('a');
        const postB = makePost('b');
        const postC = makePost('c');
        const advance = vi.fn(() => {
            throw new Error('boom');
        });
        render(
            <Harness
                current={postA}
                queue={[postB, postC]}
                advance={advance}
                initialPosts={[postA, postB]}
            />,
        );

        fireEvent.click(screen.getByText('advance'));

        // GSAP swallows exceptions thrown inside .call() callbacks in
        // production; here we just need the throw not to stop the guard
        // from doing its job, so catch it the way GSAP would.
        expect(() => act(() => lastCallFn?.())).toThrow('boom');
        expect(advance).toHaveBeenCalledOnce();

        // advanceSucceeded was never set — the throw happened first — so
        // onComplete must not commit the queue[1]-derived nextBackground.
        act(() => lastTimelineConfig?.onComplete?.());
        expect(screen.getByTestId('next-background')).toHaveTextContent('b');
    });

    it('ignores a second advance call inside the debounce window', async () => {
        const { gsap } = await import('gsap');
        vi.mocked(gsap.timeline).mockClear();
        const postA = makePost('a');
        render(
            <Harness
                current={postA}
                queue={[]}
                advance={vi.fn()}
                initialPosts={[postA]}
            />,
        );

        fireEvent.click(screen.getByText('advance'));
        fireEvent.click(screen.getByText('advance'));

        expect(gsap.timeline).toHaveBeenCalledOnce();
    });
});
