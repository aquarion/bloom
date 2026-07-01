import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FeedSidebarPanel } from './FeedSidebarPanel';

vi.mock('@/components/app-sidebar-contents', () => ({
    AppSidebarContents: () => <div data-testid="sidebar-contents" />,
}));

vi.mock('@/components/ui/sidebar', () => ({
    SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('FeedSidebarPanel', () => {
    it('renders nothing visible when closed', () => {
        render(<FeedSidebarPanel open={false} onOpenChange={vi.fn()} />);
        expect(
            screen.queryByTestId('sidebar-contents'),
        ).not.toBeInTheDocument();
    });

    it('renders nav contents and sr-only title when open', () => {
        render(<FeedSidebarPanel open={true} onOpenChange={vi.fn()} />);
        expect(screen.getByTestId('sidebar-contents')).toBeInTheDocument();
        expect(screen.getByText('Navigation')).toBeInTheDocument();
    });
});
