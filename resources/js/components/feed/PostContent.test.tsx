import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { PostContent } from './PostContent';

vi.mock('@/components/feed/PostAnimator', () => ({
    PostAnimator: ({ onReady }: { onReady?: () => void }) => {
        onReady?.();

        return <div data-testid="post-animator" />;
    },
}));

vi.mock('@/components/feed/AuthorChip', () => ({
    AuthorChip: ({
        name,
        account,
    }: {
        name: string;
        account: string;
        avatar: string;
        emojis: Record<string, string>;
    }) => (
        <div
            data-testid="author-chip"
            data-name={name}
            data-account={account}
        />
    ),
}));

const makePost = (overrides: Partial<Post> = {}): Post => ({
    id: 'p1',
    source: 'bluesky',
    source_handle: '@alice.bsky.social',
    source_instance: null,
    author_name: 'Alice',
    author_handle: '@alice.bsky.social',
    author_avatar: 'https://cdn.bsky.app/av.jpg',
    author_banner: null,
    body: 'hello',
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
    cw_is_author_level: false,
    cw_label_source: null,
    sensitive_media: false,
    ...overrides,
});

describe('PostContent — author-level CW overlay', () => {
    it('shows author chip with author name and handle for external author-level CW', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'rude content',
                    cw_is_author_level: true,
                    cw_label_source: 'external',
                })}
                cwBehavior="blur"
            />,
        );

        const chip = screen.getByTestId('author-chip');
        expect(chip).toBeInTheDocument();
        expect(chip).toHaveAttribute('data-name', 'Alice');
        expect(chip).toHaveAttribute('data-account', '@alice.bsky.social');
    });

    it('shows "has been labelled as posting" phrasing for external source', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'rude content',
                    cw_is_author_level: true,
                    cw_label_source: 'external',
                })}
                cwBehavior="blur"
            />,
        );

        expect(
            screen.getByText(/has been labelled as posting rude content/i),
        ).toBeInTheDocument();
    });

    it('shows "marks their posts as" phrasing for self source', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'Adult content',
                    cw_is_author_level: true,
                    cw_label_source: 'self',
                })}
                cwBehavior="blur"
            />,
        );

        expect(
            screen.getByText(/marks their posts as adult content/i),
        ).toBeInTheDocument();
    });

    it('shows author chip for self source', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'Adult content',
                    cw_is_author_level: true,
                    cw_label_source: 'self',
                })}
                cwBehavior="blur"
            />,
        );

        expect(screen.getByTestId('author-chip')).toBeInTheDocument();
    });

    it('does not show author chip for post-level CW', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'Graphic media',
                    cw_is_author_level: false,
                    cw_label_source: 'self',
                })}
                cwBehavior="blur"
            />,
        );

        expect(screen.queryByTestId('author-chip')).not.toBeInTheDocument();
        expect(
            screen.getByText('The author marked this post as graphic media'),
        ).toBeInTheDocument();
    });
});
