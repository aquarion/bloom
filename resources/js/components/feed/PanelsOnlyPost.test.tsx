import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import type { Post } from '@/types/post';
import { PanelsOnlyPost } from './PanelsOnlyPost';

const fromToMock = vi.fn<(...args: unknown[]) => { kill: () => void }>(() => ({
    kill: vi.fn(),
}));

vi.mock('gsap', () => ({
    gsap: {
        fromTo: (...args: unknown[]) => fromToMock(...args),
    },
}));

vi.mock('@gsap/react', () => ({
    useGSAP: (callback: () => void | (() => void)) => {
        callback();
    },
}));

function renderWithCw(post: Post, reduceMotion?: boolean) {
    return render(
        <CwStateProvider>
            <PanelsOnlyPost post={post} reduceMotion={reduceMotion} />
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
    body: '',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://mastodon.example/@user/1',
    link_url: 'https://example.com',
    link_title: 'Example',
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

describe('PanelsOnlyPost — reduceMotion panel entrance', () => {
    beforeEach(() => {
        fromToMock.mockClear();
    });

    it('fades panels up from below by default', () => {
        renderWithCw(basePost);

        expect(fromToMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ opacity: 0, y: -8 }),
            expect.anything(),
        );
    });

    it('clamps the y offset to 0 when reduceMotion is set, leaving only the opacity fade', () => {
        renderWithCw(basePost, true);

        expect(fromToMock).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ opacity: 0, y: 0 }),
            expect.anything(),
        );
    });
});
