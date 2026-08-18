import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import { ContextPanel } from './ContextPanel';

function renderWithCw(children: ReactNode) {
    return render(<CwStateProvider>{children}</CwStateProvider>);
}

const baseProps = {
    icon: null,
    author_name: 'Alice',
    author_avatar: '',
    author_handle: '@alice.bsky.social',
    emojis: {},
    body: 'the quoted body text',
    original_url: 'https://bsky.app/profile/alice.bsky.social/post/1',
    chip_mentions: [],
};

describe('ContextPanel — CW gating for nested posts', () => {
    it('shows the body when there is no cw_text', () => {
        renderWithCw(<ContextPanel {...baseProps} cwBehavior="blur" />);

        expect(screen.getByText('the quoted body text')).toBeInTheDocument();
    });

    it('hides the body and shows a gate when cw_text is set and cwBehavior is blur', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="Graphic media"
                cw_label_source="self"
                cwBehavior="blur"
            />,
        );

        expect(
            screen.queryByText('the quoted body text'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Marked as graphic media')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Show anyway' }),
        ).toBeInTheDocument();
    });

    it('shows the body despite cw_text when cwBehavior is show', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="Graphic media"
                cwBehavior="show"
            />,
        );

        expect(screen.getByText('the quoted body text')).toBeInTheDocument();
    });

    it('reveals the body after clicking "Show anyway"', async () => {
        const user = userEvent.setup();
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="Graphic media"
                cw_label_source="self"
                cwBehavior="blur"
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Show anyway' }));

        expect(screen.getByText('the quoted body text')).toBeInTheDocument();
    });

    it('still gates the body when sensitive_media is true, unlike the top-level Bluesky media-redundancy exception', () => {
        // shouldShowCwOverlay skips the overlay for a top-level Bluesky post whose
        // sensitive_media is already blurred by PostAnimator — but ContextPanel has no
        // media to blur, so nestedCwLike() omits `source` and that exception must never
        // apply here. Regression test for the bypass this specifically guards against.
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="Graphic media"
                cw_label_source="self"
                sensitive_media
                cwBehavior="blur"
            />,
        );

        expect(
            screen.queryByText('the quoted body text'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Marked as graphic media')).toBeInTheDocument();
    });

    it('shows "This author" copy and a "Show author" button for author-level CW', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="rude content"
                cw_is_author_level
                cw_label_source="external"
                cwBehavior="blur"
            />,
        );

        expect(screen.getByText('This author')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Show author' }),
        ).toBeInTheDocument();
        expect(
            screen.getByText('Labelled as rude content'),
        ).toBeInTheDocument();
    });
});

describe('ContextPanel — reply/quote media thumbnail', () => {
    const media = [
        {
            type: 'image' as const,
            url: 'https://example.com/full.jpg',
            preview_url: 'https://example.com/thumb.jpg',
            alt_text: 'A photo',
        },
    ];

    it('shows a thumbnail for the first media item', () => {
        renderWithCw(<ContextPanel {...baseProps} media={media} />);

        const img = screen.getByAltText('A photo');
        expect(img).toHaveAttribute('src', 'https://example.com/thumb.jpg');
    });

    it('falls back to the full-size url when there is no preview_url', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                media={[{ ...media[0], preview_url: null }]}
            />,
        );

        expect(screen.getByAltText('A photo')).toHaveAttribute(
            'src',
            'https://example.com/full.jpg',
        );
    });

    it('shows no thumbnail when there is no media', () => {
        renderWithCw(<ContextPanel {...baseProps} />);

        expect(
            screen.queryByTestId('reply-thumbnail'),
        ).not.toBeInTheDocument();
    });

    it('shows no thumbnail when the media is marked sensitive', () => {
        renderWithCw(
            <ContextPanel {...baseProps} media={media} sensitive_media />,
        );

        expect(
            screen.queryByTestId('reply-thumbnail'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('the quoted body text')).toBeInTheDocument();
    });

    it('hides the thumbnail along with the rest of the content behind a CW gate', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                media={media}
                cw_text="Graphic media"
                cw_label_source="self"
                cwBehavior="blur"
            />,
        );

        expect(
            screen.queryByTestId('reply-thumbnail'),
        ).not.toBeInTheDocument();
    });

    it('does not fall back to the raw video url when a video has no preview_url', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                media={[
                    {
                        type: 'video',
                        url: 'https://example.com/video.mp4',
                        preview_url: null,
                        alt_text: null,
                    },
                ]}
            />,
        );

        expect(
            screen.queryByTestId('reply-thumbnail'),
        ).not.toBeInTheDocument();
    });

    it('shows a video thumbnail from its preview_url, never its raw video url', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                media={[
                    {
                        type: 'video',
                        url: 'https://example.com/video.mp4',
                        preview_url: 'https://example.com/video-thumb.jpg',
                        alt_text: null,
                    },
                ]}
            />,
        );

        expect(screen.getByTestId('reply-thumbnail')).toHaveAttribute(
            'src',
            'https://example.com/video-thumb.jpg',
        );
    });
});

describe('ContextPanel — post-level CW corner badge (issue #285)', () => {
    it('shows a corner badge instead of decorating the chip for a visible post-level CW', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="Graphic media"
                cw_is_author_level={false}
                cwBehavior="show"
            />,
        );

        expect(screen.getByTestId('post-cw-tag')).toHaveTextContent(
            'CW: Graphic media',
        );
        expect(screen.queryByTestId('cw-marker')).not.toBeInTheDocument();
    });

    it('does not show a corner badge for an author-level CW — that stays on the chip', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="rude content"
                cw_is_author_level
                cwBehavior="show"
            />,
        );

        expect(screen.queryByTestId('post-cw-tag')).not.toBeInTheDocument();
        expect(screen.getByTestId('cw-marker')).toBeInTheDocument();
    });

    it('does not show a corner badge while the CW gate is still up', () => {
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="Graphic media"
                cw_is_author_level={false}
                cwBehavior="blur"
            />,
        );

        expect(screen.queryByTestId('post-cw-tag')).not.toBeInTheDocument();
    });

    it('shows the corner badge after revealing a gated post-level CW', async () => {
        const user = userEvent.setup();
        renderWithCw(
            <ContextPanel
                {...baseProps}
                cw_text="Graphic media"
                cw_is_author_level={false}
                cwBehavior="blur"
            />,
        );

        await user.click(screen.getByRole('button', { name: 'Show anyway' }));

        expect(screen.getByTestId('post-cw-tag')).toHaveTextContent(
            'CW: Graphic media',
        );
    });
});
