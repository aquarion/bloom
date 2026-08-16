import { render } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import type { Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

// Mocked gsap/timeline/useGSAP so no real animation runs. useGSAP defers to
// a layout effect (matching the real @gsap/react implementation) so refs are
// attached — and useAutoFitText's own measurement effect has committed real
// (non-null) fontSizes — by the time the callback runs.
vi.mock('gsap', () => ({
    gsap: {
        registerPlugin: vi.fn(),
        timeline: vi.fn(() => ({
            to: vi.fn().mockReturnThis(),
            fromTo: vi.fn().mockReturnThis(),
            kill: vi.fn(),
        })),
        set: vi.fn(),
        fromTo: vi.fn((_target, _from, to) => {
            to.onComplete?.();

            return { kill: vi.fn() };
        }),
    },
}));

vi.mock('@gsap/react', () => ({
    useGSAP: (callback: () => void | (() => void)) => {
        useLayoutEffect(() => {
            callback();
        });
    },
}));

const pickTemplateMock = vi.fn<(...args: unknown[]) => () => void>(() =>
    vi.fn(),
);
const fadeMock = vi.fn<(...args: unknown[]) => void>();

vi.mock('@/lib/animations', () => ({
    pickTemplate: (...args: unknown[]) => pickTemplateMock(...args),
    fade: (...args: unknown[]) => fadeMock(...args),
    SplitText: class {
        words: unknown[] = [{ textContent: 'hello' }];
        revert() {}
    },
}));

// Bypasses useAutoFitText's real DOM-measurement effect, which never
// produces non-null fontSizes under jsdom's zero-size getBoundingClientRect.
// containerRef/lineRefs are still real mutable ref objects that TextPost's
// own JSX populates with genuine DOM nodes during render.
vi.mock('@/hooks/useAutoFitText', () => ({
    useAutoFitText: () => ({
        containerRef: { current: null },
        lineRefs: { current: [] },
        lines: ['hello world'],
        lineKeys: [0],
        paragraphStarts: new Set(),
        fontSizes: [40],
    }),
}));

// Isolates this test from the (unrelated) paragraph-highlight algorithm,
// which expects real DOM Elements — the mocked SplitText above returns
// plain objects instead.
vi.mock('@/lib/paragraph-highlight', () => ({
    computeParagraphHighlights: () => ({ groups: [], highlights: [] }),
}));

function renderWithCw(post: Post, reduceMotion?: boolean) {
    return render(
        <CwStateProvider>
            <PostAnimator
                post={post}
                colors={null}
                reduceMotion={reduceMotion}
            />
        </CwStateProvider>,
    );
}

const basePost: Post = {
    id: 'p1',
    source: 'mastodon',
    source_handle: null,
    source_instance: 'mastodon.example',
    author_name: 'Test User',
    author_handle: '@user@mastodon.example',
    author_avatar: '',
    author_banner: null,
    body: 'Hello world',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://mastodon.example/@user/1',
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
};

describe('PostAnimator/TextPost — reduceMotion template selection', () => {
    beforeEach(() => {
        pickTemplateMock.mockClear();
        fadeMock.mockClear();
    });

    it('uses the fade template instead of a random one when reduceMotion is true', () => {
        renderWithCw({ ...basePost, id: 'p-reduced' }, true);

        expect(fadeMock).toHaveBeenCalled();
        expect(pickTemplateMock).not.toHaveBeenCalled();
    });

    it('picks a random template as usual when reduceMotion is false', () => {
        renderWithCw({ ...basePost, id: 'p-normal' }, false);

        expect(pickTemplateMock).toHaveBeenCalled();
        expect(fadeMock).not.toHaveBeenCalled();
    });

    it('defaults to the random template when reduceMotion is omitted', () => {
        renderWithCw({ ...basePost, id: 'p-default' });

        expect(pickTemplateMock).toHaveBeenCalled();
        expect(fadeMock).not.toHaveBeenCalled();
    });
});
