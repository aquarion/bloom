import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
    BlueskyConnection,
    MastodonConnection,
} from '@/components/settings/provider-section';
import Connections from './connections';

type FormRenderProps = {
    processing: boolean;
    errors: Record<string, string>;
};

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Form: ({
        children,
    }: {
        children: (props: FormRenderProps) => ReactNode;
    }) => <form>{children({ processing: false, errors: {} })}</form>,
    useForm: (initial: Record<string, unknown>) => {
        const [data, setData] = useState(initial);

        return {
            data,
            setData: (key: string, value: unknown) =>
                setData((prev) => ({ ...prev, [key]: value })),
            put: vi.fn(),
            processing: false,
        };
    },
}));

vi.mock('@/routes/bluesky', () => ({
    default: {
        store: { form: () => ({ action: '/auth/bluesky', method: 'post' }) },
        update: {
            form: () => ({
                action: '/auth/connections/1/bluesky',
                method: 'patch',
            }),
        },
    },
}));

vi.mock('@/routes/mastodon', () => ({
    default: {
        redirect: {
            form: () => ({ action: '/auth/mastodon', method: 'post' }),
        },
        reauth: {
            form: () => ({
                action: '/auth/connections/1/mastodon',
                method: 'post',
            }),
        },
    },
}));

vi.mock('@/routes/connections', () => ({
    edit: () => ({ url: '/settings/connections' }),
    destroy: {
        form: ({ account }: { account: number }) => ({
            action: `/auth/connections/${account}`,
            method: 'delete',
        }),
    },
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

vi.mock('@/routes/connections/public-mastodon', () => ({
    default: {
        store: {
            form: () => ({
                action: '/auth/connections/public-mastodon',
                method: 'post',
            }),
        },
    },
}));

vi.mock('@/components/InstanceCombobox', () => ({
    default: () => null,
}));

const makeConnection = (
    overrides: Partial<MastodonConnection> = {},
): MastodonConnection => ({
    id: 1,
    provider: 'mastodon',
    feed_type: 'home',
    handle: '@alice@fosstodon.org',
    instance_url: 'https://fosstodon.org',
    auth_failed_at: null,
    feed_settings: null,
    ...overrides,
});

const makeBlueskyConnection = (
    overrides: Partial<BlueskyConnection> = {},
): BlueskyConnection => ({
    id: 10,
    provider: 'bluesky',
    feed_type: 'home',
    handle: 'alice.bsky.social',
    instance_url: null,
    auth_failed_at: null,
    feed_settings: null,
    ...overrides,
});

describe('Connections', () => {
    it('renders both provider section headings', () => {
        render(<Connections connections={[]} />);

        expect(screen.getByText('Mastodon')).toBeInTheDocument();
        expect(screen.getByText('Bluesky')).toBeInTheDocument();
    });

    it('renders a connected account with a disconnect button', () => {
        const connection = makeConnection();
        render(<Connections connections={[connection]} />);

        const row = screen.getByTestId('account-1');
        expect(row).toBeInTheDocument();
        expect(screen.getByText('@alice@fosstodon.org')).toBeInTheDocument();
        expect(screen.getByText('Disconnect')).toBeInTheDocument();
    });

    it('renders the reauth form instead when auth has failed', () => {
        const connection = makeConnection({ auth_failed_at: '2024-01-01' });
        render(<Connections connections={[connection]} />);

        expect(screen.getByText('Reconnect')).toBeInTheDocument();
        expect(screen.getByText(/credentials expired/)).toBeInTheDocument();
    });

    it('renders a secondary-list row with a remove button', () => {
        const connection = makeConnection({
            id: 2,
            feed_type: 'public_mastodon',
            handle: null,
        });
        render(<Connections connections={[connection]} />);

        expect(screen.getByTestId('account-2')).toBeInTheDocument();
        expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    it('renders a known status message', () => {
        render(<Connections connections={[]} status="mastodon-connected" />);

        expect(
            screen.getByText('Mastodon account connected.'),
        ).toBeInTheDocument();
    });

    it('renders a bluesky-specific status message', () => {
        render(<Connections connections={[]} status="bluesky-connected" />);

        expect(
            screen.getByText('Bluesky account connected.'),
        ).toBeInTheDocument();
    });

    it('renders the bluesky reauth form with an app-password field instead of the mastodon reconnect button', () => {
        const connection = makeBlueskyConnection({
            auth_failed_at: '2024-01-01',
        });
        render(<Connections connections={[connection]} />);

        expect(screen.getByLabelText('New app password')).toBeInTheDocument();
        expect(screen.getByText(/credentials expired/)).toBeInTheDocument();
    });

    it('toggles feed settings and disables the age cutoff input when Inherit is checked', async () => {
        const user = userEvent.setup();
        const connection = makeConnection({
            feed_settings: { max_posts: 20, max_age_days: 7 },
        });
        render(<Connections connections={[connection]} />);

        expect(screen.queryByLabelText('Max posts')).not.toBeInTheDocument();

        await user.click(screen.getByText('Feed settings'));

        const maxPosts = screen.getByLabelText('Max posts');
        const ageCutoff = screen.getByLabelText('Age cutoff (days)');
        expect(maxPosts).toHaveValue(20);
        expect(ageCutoff).not.toBeDisabled();

        await user.click(screen.getByLabelText('Inherit'));

        expect(ageCutoff).toBeDisabled();
    });

    it('renders the mastodon add-account and add-timeline forms', () => {
        render(<Connections connections={[]} />);

        expect(screen.getByLabelText('Instance URL')).toBeInTheDocument();
        expect(screen.getByText('Connect Mastodon')).toBeInTheDocument();
        expect(screen.getByText('Add public timeline')).toBeInTheDocument();
        expect(screen.getByText('Add timeline')).toBeInTheDocument();
    });

    it('renders the bluesky add-account form and hides the add-feed form without a home account', () => {
        render(<Connections connections={[]} />);

        expect(screen.getByLabelText('Handle')).toBeInTheDocument();
        expect(screen.getByLabelText('App Password')).toBeInTheDocument();
        expect(screen.getByText('Connect Bluesky')).toBeInTheDocument();
        expect(
            screen.queryByText('Add algorithmic feed'),
        ).not.toBeInTheDocument();
    });

    it('shows the add-feed form once a bluesky home account exists', () => {
        const connection = makeBlueskyConnection();
        render(<Connections connections={[connection]} />);

        expect(screen.getByText('Add algorithmic feed')).toBeInTheDocument();
        expect(screen.getByLabelText('Feed URL')).toBeInTheDocument();
    });

    it('renders a bluesky algorithmic feed row in the secondary list', () => {
        const connection = makeBlueskyConnection({
            id: 11,
            feed_type: 'bluesky_feed',
            handle: null,
            feed_settings: { feed_uri: 'at://did:plc:abc/feed/whats-hot' },
        });
        render(<Connections connections={[connection]} />);

        const row = screen.getByTestId('account-11');
        expect(
            within(row).getByText('at://did:plc:abc/feed/whats-hot'),
        ).toBeInTheDocument();
    });
});
