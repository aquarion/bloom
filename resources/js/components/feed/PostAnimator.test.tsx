import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import type { MediaAttachment, Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

function renderWithCw(children: ReactNode) {
    return render(<CwStateProvider>{children}</CwStateProvider>);
}

// Mock GSAP to prevent animation errors in tests
vi.mock('gsap', () => ({
    gsap: {
        registerPlugin: vi.fn(),
        timeline: vi.fn(() => ({
            to: vi.fn().mockReturnThis(),
            fromTo: vi.fn().mockReturnThis(),
            kill: vi.fn(),
        })),
        set: vi.fn(),
    },
}));

vi.mock('@gsap/react', () => ({
    useGSAP: vi.fn(),
}));

vi.mock('@/lib/animations', () => ({
    pickTemplate: vi.fn(),
    SplitText: class {},
}));

// Mock ImageCarousel so PostAnimator tests stay focused on the branch logic
vi.mock('@/components/feed/ImageCarousel', () => ({
    ImageCarousel: ({
        onComplete,
        media,
        blurMedia,
    }: {
        onComplete: () => void;
        media: MediaAttachment[];
        blurMedia?: boolean;
    }) => (
        <div
            data-testid="image-carousel"
            data-count={media.length}
            data-blur={String(blurMedia ?? false)}
        >
            <button type="button" onClick={onComplete}>
                carousel-done
            </button>
        </div>
    ),
}));

const makeImage = (url: string): MediaAttachment => ({
    type: 'image',
    url,
    preview_url: null,
    alt_text: null,
});

const makePost = (overrides: Partial<Post> = {}): Post => ({
    id: 'p1',
    source: 'bluesky',
    source_handle: '@test.bsky.social',
    source_instance: null,
    author_name: 'Test',
    author_handle: '@test.bsky.social',
    author_avatar: '',
    author_banner: null,
    body: '',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://bsky.app/test',
    link_url: null,
    link_title: null,
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
    ...overrides,
});

describe('PostAnimator — image branch', () => {
    it('renders ImageCarousel when post has media', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toBeInTheDocument();
    });

    it('passes all media items to ImageCarousel', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({
                    media: [makeImage('a.jpg'), makeImage('b.jpg')],
                })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toHaveAttribute(
            'data-count',
            '2',
        );
    });

    it('shows the post body below the carousel when body and media are both present', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({
                    media: [makeImage('a.jpg')],
                    body: 'Look at this photo',
                })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toBeInTheDocument();
        expect(screen.getByText('Look at this photo')).toBeInTheDocument();
    });

    it('calls onAdvance (not onReady) when ImageCarousel calls onComplete', () => {
        const onAdvance = vi.fn();
        const onReady = vi.fn();
        renderWithCw(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
                onReady={onReady}
                onAdvance={onAdvance}
            />,
        );

        fireEvent.click(screen.getByText('carousel-done'));

        expect(onAdvance).toHaveBeenCalledOnce();
        expect(onReady).not.toHaveBeenCalled();
    });

    it('falls back to onReady when onAdvance is not provided', () => {
        const onReady = vi.fn();
        renderWithCw(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
                onReady={onReady}
            />,
        );

        fireEvent.click(screen.getByText('carousel-done'));

        expect(onReady).toHaveBeenCalledOnce();
    });

    it('shows reply_to context panel when image post has a reply', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({
                    media: [makeImage('a.jpg')],
                    reply_to: {
                        author_name: 'Jane',
                        author_handle: '@jane',
                        author_avatar: '',
                        original_url: 'https://example.com/status/1',
                        body: 'Original post',
                        created_at: null,
                        chip_mentions: [],
                        cw_text: null,
                        cw_is_author_level: false,
                        cw_label_source: null,
                        cw_category: null,
                        sensitive_media: false,
                    },
                })}
                colors={null}
            />,
        );
        expect(screen.getByText('Original post')).toBeInTheDocument();
    });

    it('shows quoted_post context panel when image post has a quote', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({
                    media: [makeImage('a.jpg')],
                    quoted_post: {
                        author_name: 'Bob',
                        author_handle: '@bob',
                        author_avatar: '',
                        original_url: 'https://example.com/status/2',
                        body: 'Quoted post body',
                        created_at: null,
                        chip_mentions: [],
                        cw_text: null,
                        cw_is_author_level: false,
                        cw_label_source: null,
                        cw_category: null,
                        sensitive_media: false,
                    },
                })}
                colors={null}
            />,
        );
        expect(screen.getByText('Quoted post body')).toBeInTheDocument();
    });

    it('forwards blurMedia to ImageCarousel', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
                blurMedia={true}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toHaveAttribute(
            'data-blur',
            'true',
        );
    });

    it('passes blurMedia=false by default', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toHaveAttribute(
            'data-blur',
            'false',
        );
    });
});

describe('PostAnimator — text branch', () => {
    it('renders hashtag links using the precomputed url', () => {
        renderWithCw(
            <PostAnimator
                post={makePost({
                    body: 'Hello world',
                    hashtags: [
                        {
                            tag: 'sunny',
                            url: 'https://mastodon.example/tags/sunny',
                        },
                    ],
                })}
                colors={null}
            />,
        );

        expect(screen.getByRole('link', { name: '#sunny' })).toHaveAttribute(
            'href',
            'https://mastodon.example/tags/sunny',
        );
    });
});
