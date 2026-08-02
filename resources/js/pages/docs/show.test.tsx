import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Show from './show';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
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
}));

describe('docs/show — legal docs subnav', () => {
    it('shows the subnav on the privacy page, with privacy marked current', () => {
        render(
            <Show
                slug="privacy"
                title="Privacy Policy"
                content="<p>content</p>"
                last_updated={null}
            />,
        );

        const subnav = screen.getByRole('navigation', {
            name: 'Legal documents',
        });
        expect(
            within(subnav).getByRole('link', { name: 'Privacy Policy' }),
        ).toHaveAttribute('aria-current', 'page');
        expect(
            within(subnav).getByRole('link', { name: 'Cookie Policy' }),
        ).toHaveAttribute('href', '/docs/cookies');
        expect(
            within(subnav).getByRole('link', { name: 'Legal Changes' }),
        ).toHaveAttribute('href', '/docs/legal-changes');
    });

    it('shows the subnav on the cookies page, with cookies marked current', () => {
        render(
            <Show
                slug="cookies"
                title="Cookie Policy"
                content="<p>content</p>"
                last_updated={null}
            />,
        );

        const subnav = screen.getByRole('navigation', {
            name: 'Legal documents',
        });
        expect(
            within(subnav).getByRole('link', { name: 'Cookie Policy' }),
        ).toHaveAttribute('aria-current', 'page');
        expect(
            within(subnav).getByRole('link', { name: 'Privacy Policy' }),
        ).not.toHaveAttribute('aria-current');
    });

    it('does not show the subnav on non-legal docs (e.g. the changelog)', () => {
        render(
            <Show
                slug="changelog"
                title="Changelog"
                content="<p>content</p>"
                last_updated={null}
            />,
        );

        expect(
            screen.queryByRole('navigation', { name: 'Legal documents' }),
        ).not.toBeInTheDocument();
    });

    it('renders the page title and content', () => {
        render(
            <Show
                slug="changelog"
                title="Changelog"
                content="<p>hello world</p>"
                last_updated="2026-08-01"
            />,
        );

        expect(
            screen.getByRole('heading', { name: 'Changelog' }),
        ).toBeInTheDocument();
        expect(screen.getByText('hello world')).toBeInTheDocument();
        expect(screen.getByText(/Last updated 2026-08-01/)).toBeInTheDocument();
    });
});
