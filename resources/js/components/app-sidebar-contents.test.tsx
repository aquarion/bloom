import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppSidebarContents } from '@/components/app-sidebar-contents';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@inertiajs/react', () => ({
    Link: ({
        href,
        children,
        ...props
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => (
        <a href={typeof href === 'string' ? href : href.url} {...props}>
            {children}
        </a>
    ),
    usePage: () => ({
        props: {
            auth: { user: null },
            appVersion: null,
        },
        url: '/feed',
    }),
    router: { flushAll: vi.fn() },
}));

function renderSidebar() {
    return render(
        <TooltipProvider>
            <SidebarProvider>
                <AppSidebarContents />
            </SidebarProvider>
        </TooltipProvider>,
    );
}

describe('AppSidebarContents — legal docs link', () => {
    it('shows a single "Terms and Conditions" link pointing at the privacy doc', () => {
        renderSidebar();

        const link = screen.getByRole('link', {
            name: 'Terms and Conditions',
        });
        expect(link).toHaveAttribute('href', '/docs/privacy');
    });

    it('no longer shows the separate Privacy Policy, Cookie Policy, or Legal Changes links', () => {
        renderSidebar();

        expect(
            screen.queryByRole('link', { name: 'Privacy Policy' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Cookie Policy' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('link', { name: 'Legal Changes' }),
        ).not.toBeInTheDocument();
    });
});
