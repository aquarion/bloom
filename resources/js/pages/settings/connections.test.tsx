import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SocialConnection } from '@/components/settings/provider-section';
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
    useForm: (initial: Record<string, unknown>) => ({
        data: initial,
        setData: vi.fn(),
        put: vi.fn(),
        processing: false,
    }),
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
    overrides: Partial<SocialConnection> = {},
): SocialConnection => ({
    id: 1,
    provider: 'mastodon',
    feed_type: 'home',
    handle: '@alice@fosstodon.org',
    instance_url: 'https://fosstodon.org',
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
});
