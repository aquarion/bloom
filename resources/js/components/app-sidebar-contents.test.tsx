import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebarContents } from '@/components/app-sidebar-contents';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

let mockAppVersion: { label: string; url: string | null } | null = null;

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
            appVersion: mockAppVersion,
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

describe('AppSidebarContents — version label link', () => {
    beforeEach(() => {
        mockAppVersion = null;
    });

    it('deep-links to appVersion.url when provided, in a new tab', () => {
        mockAppVersion = {
            label: 'v1.12.0',
            url: 'https://github.com/aquarion/bloom/commit/abc123',
        };
        renderSidebar();

        const link = screen.getByRole('link', { name: 'v1.12.0' });
        expect(link).toHaveAttribute(
            'href',
            'https://github.com/aquarion/bloom/commit/abc123',
        );
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('falls back to the changelog page when appVersion.url is null', () => {
        mockAppVersion = { label: 'v1.12.0', url: null };
        renderSidebar();

        const link = screen.getByRole('link', { name: 'v1.12.0' });
        expect(link).toHaveAttribute('href', '/docs/changelog');
    });

    it('shows no version label when appVersion is null', () => {
        mockAppVersion = null;
        renderSidebar();

        expect(
            screen.queryByRole('link', { name: /^v\d/ }),
        ).not.toBeInTheDocument();
    });
});
