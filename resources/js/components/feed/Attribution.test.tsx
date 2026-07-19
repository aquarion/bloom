import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { CwStateProvider, useCwState } from '@/hooks/useCwState';
import type { Post } from '@/types/post';
import { Attribution } from './Attribution';

function renderWithCw(children: ReactNode) {
    return render(<CwStateProvider>{children}</CwStateProvider>);
}

const makePost = (overrides: Partial<Post> = {}): Post => ({
    id: 'p1',
    source: 'bluesky',
    source_handle: '@alice.bsky.social',
    source_instance: null,
    author_name: 'Alice',
    author_handle: '@alice.bsky.social',
    author_avatar: '',
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
    cw_category: null,
    sensitive_media: false,
    ...overrides,
});

describe('Attribution — CW label leak guard', () => {
    it('does not leak the CW label in the always-visible chrome bar when cwBehavior is blur and unrevealed', () => {
        renderWithCw(
            <Attribution
                post={makePost({
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                })}
                cwBehavior="blur"
            />,
        );

        expect(screen.queryByText(/⚠️/)).not.toBeInTheDocument();
    });

    it('shows the CW label once the post has been revealed via a sibling PostContent overlay', async () => {
        // Simulate PostContent's reveal button living in the same CwStateProvider tree
        // as Attribution — both read/write the same shared reveal state.
        function Harness() {
            const post = makePost({
                cw_text: 'Adult content',
                cw_is_author_level: false,
            });

            return (
                <>
                    <Attribution post={post} cwBehavior="blur" />
                    <RevealButton post={post} />
                </>
            );
        }

        function RevealButton({ post }: { post: Post }) {
            const { reveal } = useCwState();

            return (
                <button type="button" onClick={() => reveal(post)}>
                    reveal
                </button>
            );
        }

        const user = userEvent.setup();
        renderWithCw(<Harness />);

        expect(screen.queryByText(/⚠️/)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'reveal' }));

        expect(screen.getByText(/⚠️ Adult content/)).toBeInTheDocument();
    });

    it('shows the CW label immediately when cwBehavior is show (no overlay gate exists to leak past)', () => {
        renderWithCw(
            <Attribution
                post={makePost({
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                })}
                cwBehavior="show"
            />,
        );

        expect(screen.getByText(/⚠️ Adult content/)).toBeInTheDocument();
    });

    it('does not leak a whitelisted quoted_post CW label either', () => {
        renderWithCw(
            <Attribution
                post={makePost({
                    quoted_post: {
                        author_name: 'Bob',
                        author_handle: '@bob.bsky.social',
                        author_avatar: '',
                        original_url: 'https://bsky.app/quoted',
                        body: 'quoted body',
                        created_at: null,
                        chip_mentions: [],
                        cw_text: 'Graphic media',
                        cw_is_author_level: false,
                        cw_label_source: 'self',
                        cw_category: 'graphic',
                        sensitive_media: true,
                    },
                })}
                cwBehavior="blur"
            />,
        );

        expect(screen.queryByText(/⚠️/)).not.toBeInTheDocument();
    });
});
