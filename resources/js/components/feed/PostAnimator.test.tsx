import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MediaAttachment, Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

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
    }: {
        onComplete: () => void;
        media: MediaAttachment[];
    }) => (
        <div data-testid="image-carousel" data-count={media.length}>
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
    sensitive_media: false,
    ...overrides,
});

describe('PostAnimator — image branch', () => {
    it('renders ImageCarousel when post has media', () => {
        render(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toBeInTheDocument();
    });

    it('passes all media items to ImageCarousel', () => {
        render(
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
        render(
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

    it('calls onReady when ImageCarousel calls onComplete', () => {
        const onReady = vi.fn();
        render(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
                onReady={onReady}
            />,
        );

        fireEvent.click(screen.getByText('carousel-done'));

        expect(onReady).toHaveBeenCalledOnce();
    });
});
