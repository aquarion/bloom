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
