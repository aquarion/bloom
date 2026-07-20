import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import type { Post } from '@/types/post';
import { ContextPanel } from './ContextPanel';
import { PostContent } from './PostContent';

function renderWithCw(children: ReactNode) {
    return render(<CwStateProvider>{children}</CwStateProvider>);
}

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
    ...overrides,
});

describe('PostContent — author-level CW overlay', () => {
    it('shows author chip with author name and handle for external author-level CW', () => {
        renderWithCw(
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
        renderWithCw(
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
        renderWithCw(
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
        renderWithCw(
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
        renderWithCw(
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

describe('PostContent — revealing a CW', () => {
    it('hides the overlay for this post after clicking reveal', async () => {
        const user = userEvent.setup();
        renderWithCw(
            <PostContent
                post={makePost({
                    id: 'p1',
                    cw_text: 'Graphic media',
                    cw_is_author_level: false,
                    cw_label_source: 'self',
                })}
                cwBehavior="blur"
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Show anyway' }));

        expect(
            screen.queryByText('The author marked this post as graphic media'),
        ).not.toBeInTheDocument();
    });

    it('does not reveal a different post-level CW from the same author', async () => {
        const user = userEvent.setup();
        const postA = makePost({
            id: 'p1',
            author_handle: '@alice.bsky.social',
            cw_text: 'Graphic media',
            cw_is_author_level: false,
            cw_label_source: 'self',
        });
        const postB = makePost({
            id: 'p2',
            author_handle: '@alice.bsky.social',
            cw_text: 'Adult content',
            cw_is_author_level: false,
            cw_label_source: 'self',
        });

        renderWithCw(
            <>
                <PostContent post={postA} cwBehavior="blur" />
                <PostContent post={postB} cwBehavior="blur" />
            </>,
        );

        const [revealPostA] = screen.getAllByRole('button', {
            name: 'Show anyway',
        });
        await user.click(revealPostA);

        expect(
            screen.getByText('The author marked this post as adult content'),
        ).toBeInTheDocument();
    });

    it('reveals a different post from the same author after an author-level accept', async () => {
        const user = userEvent.setup();
        const postA = makePost({
            id: 'p1',
            author_handle: '@alice.bsky.social',
            cw_text: 'rude content',
            cw_is_author_level: true,
            cw_label_source: 'self',
        });
        const postB = makePost({
            id: 'p2',
            author_handle: '@alice.bsky.social',
            cw_text: 'Adult content',
            cw_is_author_level: false,
            cw_label_source: 'self',
        });

        renderWithCw(
            <>
                <PostContent post={postA} cwBehavior="blur" />
                <PostContent post={postB} cwBehavior="blur" />
            </>,
        );

        await user.click(screen.getByRole('button', { name: 'Show author' }));

        expect(
            screen.queryByText('The author marked this post as adult content'),
        ).not.toBeInTheDocument();
    });
});

describe('PostContent + ContextPanel — parent/nested reveal isolation', () => {
    const nestedPanelProps = {
        icon: null,
        author_name: 'Bob',
        author_avatar: '',
        author_handle: '@bob.bsky.social',
        emojis: {},
        body: 'the quoted body text',
        original_url: 'https://bsky.app/profile/bob.bsky.social/post/1',
        chip_mentions: [],
    };

    it('revealing the parent post-level CW does not reveal a nested post from a different author', async () => {
        const user = userEvent.setup();
        renderWithCw(
            <>
                <PostContent
                    post={makePost({
                        cw_text: 'Graphic media',
                        cw_is_author_level: false,
                        cw_label_source: 'self',
                    })}
                    cwBehavior="blur"
                />
                <ContextPanel
                    {...nestedPanelProps}
                    cw_text="Adult content"
                    cw_label_source="self"
                    cwBehavior="blur"
                />
            </>,
        );

        const [revealParent] = screen.getAllByRole('button', {
            name: 'Show anyway',
        });
        await user.click(revealParent);

        expect(
            screen.queryByText('the quoted body text'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Marked as adult content')).toBeInTheDocument();
    });

    it('revealing a nested post-level CW does not reveal the parent post', async () => {
        const user = userEvent.setup();
        renderWithCw(
            <>
                <PostContent
                    post={makePost({
                        cw_text: 'Graphic media',
                        cw_is_author_level: false,
                        cw_label_source: 'self',
                    })}
                    cwBehavior="blur"
                />
                <ContextPanel
                    {...nestedPanelProps}
                    cw_text="Adult content"
                    cw_label_source="self"
                    cwBehavior="blur"
                />
            </>,
        );

        const [, revealNested] = screen.getAllByRole('button', {
            name: 'Show anyway',
        });
        await user.click(revealNested);

        expect(
            screen.getByText('The author marked this post as graphic media'),
        ).toBeInTheDocument();
    });

    it('revealing an author-level CW on the parent also reveals a nested post from the same author', async () => {
        const user = userEvent.setup();
        renderWithCw(
            <>
                <PostContent
                    post={makePost({
                        cw_text: 'rude content',
                        cw_is_author_level: true,
                        cw_label_source: 'external',
                    })}
                    cwBehavior="blur"
                />
                <ContextPanel
                    {...nestedPanelProps}
                    author_handle="@alice.bsky.social"
                    cw_text="Adult content"
                    cw_label_source="self"
                    cwBehavior="blur"
                />
            </>,
        );

        await user.click(screen.getByRole('button', { name: 'Show author' }));

        expect(screen.getByText('the quoted body text')).toBeInTheDocument();
    });
});
