import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { FeedGeneratorSummary } from '@/types/feed-generator';
import BlueskyFeeds from './bluesky-feeds';

type FormRenderProps = {
    processing: boolean;
    errors: Record<string, string>;
};

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        children,
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
    Form: ({
        action,
        method,
        children,
    }: {
        action?: string;
        method?: string;
        children: (props: FormRenderProps) => ReactNode;
    }) => (
        <form
            action={action}
            method={method}
            onSubmit={(e) => e.preventDefault()}
        >
            {children({ processing: false, errors: {} })}
        </form>
    ),
}));

vi.mock('@/routes/connections', () => ({
    edit: () => ({ url: '/settings/connections' }),
}));

vi.mock('@/routes/connections/bluesky-feed', () => ({
    default: {
        store: {
            form: () => ({
                action: '/auth/connections/bluesky-feed',
                method: 'post',
            }),
        },
    },
}));

vi.mock('@/routes/connections/bluesky-feeds', () => ({
    default: {
        search: {
            url: ({ query }: { query: { q: string } }) =>
                `/settings/connections/bluesky-feeds/search?q=${query.q}`,
        },
    },
}));

const mockGet = vi.fn();
vi.mock('axios', () => ({
    default: {
        get: (...args: unknown[]) => mockGet(...args),
        isCancel: () => false,
    },
}));

const makeFeed = (
    overrides: Partial<FeedGeneratorSummary> = {},
): FeedGeneratorSummary => ({
    uri: 'at://did:plc:test/app.bsky.feed.generator/whats-hot',
    display_name: "What's Hot",
    description: 'Popular posts',
    avatar: 'https://cdn.bsky.app/avatar.jpg',
    creator_handle: 'bsky.app',
    like_count: 42,
    ...overrides,
});

describe('BlueskyFeeds', () => {
    it('renders the popular feeds list', () => {
        render(<BlueskyFeeds popularFeeds={[makeFeed()]} />);

        expect(screen.getByText('Popular feeds')).toBeInTheDocument();
        expect(screen.getByText("What's Hot")).toBeInTheDocument();
    });

    it('shows an empty state when there are no popular feeds', () => {
        render(<BlueskyFeeds popularFeeds={[]} />);

        expect(screen.getByText('No feeds found.')).toBeInTheDocument();
    });

    it('submits the add-feed form with the feed uri', () => {
        const feed = makeFeed();
        render(<BlueskyFeeds popularFeeds={[feed]} />);

        const button = screen.getByText('Add');
        const form = button.closest('form');
        expect(form).toHaveAttribute(
            'action',
            '/auth/connections/bluesky-feed',
        );
        expect(form).toHaveAttribute('method', 'post');
        expect(form?.querySelector('input[name="feed_url"]')).toHaveValue(
            feed.uri,
        );
    });

    it('searches feeds as the user types and replaces the popular list', async () => {
        const user = userEvent.setup();
        mockGet.mockResolvedValue({
            data: { feeds: [makeFeed({ display_name: 'Science Daily' })] },
        });

        render(<BlueskyFeeds popularFeeds={[makeFeed()]} />);

        await user.type(screen.getByLabelText('Search feeds'), 'science');

        await waitFor(() => expect(mockGet).toHaveBeenCalled(), {
            timeout: 1000,
        });
        await waitFor(() =>
            expect(screen.getByText('Search results')).toBeInTheDocument(),
        );
        expect(screen.getByText('Science Daily')).toBeInTheDocument();
    });

    it('toggles the manual paste fallback form', async () => {
        const user = userEvent.setup();
        render(<BlueskyFeeds popularFeeds={[]} />);

        expect(screen.queryByLabelText('Feed URL')).not.toBeInTheDocument();

        await user.click(screen.getByText('Paste a feed URL instead'));

        expect(screen.getByLabelText('Feed URL')).toBeInTheDocument();
    });

    it('renders a known status message', () => {
        render(<BlueskyFeeds popularFeeds={[]} status="bluesky-feed-added" />);

        expect(
            screen.getByText('Bluesky algorithmic feed added.'),
        ).toBeInTheDocument();
    });
});
