import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import type { Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

function renderWithCw(children: ReactNode) {
    return render(<CwStateProvider>{children}</CwStateProvider>);
}

// Mock GSAP so the "fade panels in" effect runs its callback synchronously,
// mirroring the approach used in PostAnimator.test.tsx.
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
        callback();
    },
}));

vi.mock('@/lib/animations', () => ({
    pickTemplate: vi.fn(() => vi.fn()),
    SplitText: class {
        words: unknown[] = [];
        revert() {}
    },
}));

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

const poll = {
    id: '1',
    expires_at: null,
    expired: false,
    multiple: false,
    votes_count: 10,
    options: [
        { title: 'Yes', votes_count: 7 },
        { title: 'No', votes_count: 3 },
    ],
    voted: false,
    own_votes: [],
};

describe('PostAnimator — poll rendering', () => {
    it('renders poll results for a poll-only post (no body, no media)', () => {
        renderWithCw(
            <PostAnimator post={{ ...basePost, poll }} colors={null} />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('renders poll results alongside body text', () => {
        renderWithCw(
            <PostAnimator
                post={{ ...basePost, body: 'What do you think?', poll }}
                colors={null}
            />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders poll results on an image post', () => {
        renderWithCw(
            <PostAnimator
                post={{
                    ...basePost,
                    media: [
                        {
                            type: 'image',
                            url: 'https://example.com/a.jpg',
                            preview_url: null,
                            alt_text: 'a photo',
                        },
                    ],
                    poll,
                }}
                colors={null}
                onRevealMedia={vi.fn()}
            />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders nothing but does not crash for a post with no body, no media, and no poll', () => {
        const { container } = renderWithCw(
            <PostAnimator post={basePost} colors={null} />,
        );

        expect(container.firstChild).toBeNull();
    });

    it('calls onReady for a poll-only post', () => {
        const onReady = vi.fn();

        renderWithCw(
            <PostAnimator
                post={{ ...basePost, poll }}
                colors={null}
                onReady={onReady}
            />,
        );

        expect(onReady).toHaveBeenCalled();
    });

    it('renders poll results alongside a reply context panel and a link card in the same panel stack', () => {
        renderWithCw(
            <PostAnimator
                post={{
                    ...basePost,
                    poll,
                    link_url: 'https://example.com/article',
                    link_title: 'An article',
                    link_description: null,
                    link_image: null,
                    link_favicon: null,
                    link_youtube_id: null,
                    reply_to: {
                        author_name: 'Reply Author',
                        author_handle: '@reply@mastodon.example',
                        author_avatar: '',
                        original_url: 'https://mastodon.example/@reply/1',
                        body: 'This is the parent post',
                        created_at: new Date().toISOString(),
                        chip_mentions: [],
                        cw_text: null,
                        cw_is_author_level: false,
                        cw_label_source: null,
                        cw_category: null,
                        sensitive_media: false,
                    },
                }}
                colors={null}
            />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText('No')).toBeInTheDocument();
        expect(screen.getByText('This is the parent post')).toBeInTheDocument();
        expect(screen.getByText('An article')).toBeInTheDocument();
    });
});
