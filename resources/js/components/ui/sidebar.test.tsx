import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarProvider, useSidebar } from './sidebar';

vi.mock('@/hooks/use-mobile', () => ({
    useIsMobile: () => false,
}));

function DoubleToggleButton() {
    const { toggleSidebar, state } = useSidebar();

    return (
        <>
            <button
                onClick={() => {
                    toggleSidebar();
                    toggleSidebar();
                }}
            >
                Double toggle
            </button>
            <span data-testid="state">{state}</span>
        </>
    );
}

describe('SidebarProvider toggleSidebar', () => {
    it('nets two consecutive toggles fired in the same event handler back to the starting state', () => {
        render(
            <SidebarProvider defaultOpen={true}>
                <DoubleToggleButton />
            </SidebarProvider>,
        );

        expect(screen.getByTestId('state')).toHaveTextContent('expanded');

        fireEvent.click(screen.getByText('Double toggle'));

        expect(screen.getByTestId('state')).toHaveTextContent('expanded');
    });
});
