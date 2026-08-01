import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpBubble } from './HelpBubble';

describe('HelpBubble', () => {
    it('renders nothing when closed', () => {
        const { container } = render(
            <HelpBubble open={false} onDismiss={vi.fn()}>
                A tip
            </HelpBubble>,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it('shows its content when open', () => {
        render(
            <HelpBubble open onDismiss={vi.fn()}>
                A tip
            </HelpBubble>,
        );

        expect(screen.getByText('A tip')).toBeInTheDocument();
    });

    it('calls onDismiss when the close button is clicked', async () => {
        const user = userEvent.setup();
        const onDismiss = vi.fn();
        render(
            <HelpBubble open onDismiss={onDismiss}>
                A tip
            </HelpBubble>,
        );

        await user.click(screen.getByLabelText('Dismiss tip'));

        expect(onDismiss).toHaveBeenCalledOnce();
    });
});
