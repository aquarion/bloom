import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const FAVICON_404_KEY = 'bloom:favicon404s:v1';

beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
});

describe('LinkCard', () => {
    it('renders the favicon image for a previously-unfailed url', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://example.com"
                title="Example"
                description={null}
                image={null}
                favicon="https://example.com/favicon.ico"
            />,
        );

        expect(container.querySelector('img')).toHaveAttribute(
            'src',
            'https://example.com/favicon.ico',
        );
    });

    it('hides the favicon and persists the failure after an image load error', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://example.com"
                title="Example"
                description={null}
                image={null}
                favicon="https://example.com/favicon.ico"
            />,
        );

        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        fireEvent.error(img as HTMLImageElement);

        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(
            JSON.parse(localStorage.getItem(FAVICON_404_KEY) ?? '[]'),
        ).toContain('https://example.com/favicon.ico');
    });

    it('does not render a favicon that failed in a previous session', async () => {
        localStorage.setItem(
            FAVICON_404_KEY,
            JSON.stringify(['https://example.com/favicon.ico']),
        );

        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://example.com"
                title="Example"
                description={null}
                image={null}
                favicon="https://example.com/favicon.ico"
            />,
        );

        expect(container.querySelector('img')).not.toBeInTheDocument();
    });

    it('renders a youtube thumbnail and play button when youtubeId is present', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                title="A Video"
                description={null}
                image={null}
                favicon={null}
                youtubeId="dQw4w9WgXcQ"
            />,
        );

        expect(container.querySelector('img')).toHaveAttribute(
            'src',
            'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        );
        expect(container.querySelector('svg')).toBeInTheDocument();
        expect(container.textContent).toContain('A Video');
    });

    it('falls back to the generic card when the youtube thumbnail fails to load', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                title="A Video"
                description={null}
                image={null}
                favicon={null}
                youtubeId="dQw4w9WgXcQ"
            />,
        );

        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        fireEvent.error(img as HTMLImageElement);

        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(container.textContent).toContain('youtube.com');
    });

    it('renders the generic card when youtubeId is absent', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://example.com/article"
                title="Example"
                description={null}
                image={null}
                favicon={null}
            />,
        );

        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(container.textContent).toContain('example.com');
    });

    it('renders the preview image and description when both are present', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://example.com/article"
                title="An Article"
                description="A short summary of the article."
                image="https://example.com/og.jpg"
                favicon={null}
            />,
        );

        expect(container.querySelector('img')).toHaveAttribute(
            'src',
            'https://example.com/og.jpg',
        );
        expect(container.textContent).toContain('An Article');
        expect(container.textContent).toContain(
            'A short summary of the article.',
        );
        expect(container.textContent).toContain('example.com');
    });

    it('falls back to the text-only card when the preview image fails to load', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://example.com/article"
                title="An Article"
                description="A short summary of the article."
                image="https://example.com/og.jpg"
                favicon={null}
            />,
        );

        const img = container.querySelector('img');
        expect(img).not.toBeNull();
        fireEvent.error(img as HTMLImageElement);

        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(container.textContent).toContain('An Article');
        expect(container.textContent).toContain(
            'A short summary of the article.',
        );
    });

    it('renders the description in the text-only card when there is no image', async () => {
        const { LinkCard } = await import('./LinkCard');
        const { container } = render(
            <LinkCard
                url="https://example.com/article"
                title="An Article"
                description="A short summary of the article."
                image={null}
                favicon={null}
            />,
        );

        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(container.textContent).toContain(
            'A short summary of the article.',
        );
    });
});
