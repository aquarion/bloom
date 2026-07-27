import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsePasskeyReturn } from '@/hooks/use-passkey';
import { usePasskey } from '@/hooks/use-passkey';
import type { MastodonConnection } from './provider-section';
import { DisconnectButton } from './provider-section';

const { routerDelete } = vi.hoisted(() => ({ routerDelete: vi.fn() }));

vi.mock('@inertiajs/react', () => ({
    router: { delete: routerDelete },
}));

vi.mock('@/hooks/use-passkey');

vi.mock('@/routes/connections', () => ({
    destroy: {
        url: ({ account }: { account: number }) =>
            `/auth/connections/${account}`,
    },
}));

const mockPasskey = (
    overrides: Partial<UsePasskeyReturn> = {},
): UsePasskeyReturn => ({
    isSupported: true,
    loading: false,
    error: null,
    register: vi.fn().mockResolvedValue(true),
    authenticate: vi.fn(),
    confirmIdentity: vi.fn().mockResolvedValue(true),
    confirmIfNeeded: vi.fn().mockResolvedValue(true),
    startConditional: vi.fn(),
    abortConditional: vi.fn(),
    ...overrides,
});

const connection: MastodonConnection = {
    id: 7,
    provider: 'mastodon',
    feed_type: 'home',
    handle: '@alice@fosstodon.org',
    instance_url: 'https://fosstodon.org',
    auth_failed_at: null,
    feed_name: null,
    feed_settings: null,
};

beforeEach(() => {
    routerDelete.mockReset();
});

describe('DisconnectButton step-up gating', () => {
    it('does not disconnect when the step-up confirmation is declined', async () => {
        const user = userEvent.setup();
        const confirmIfNeeded = vi.fn().mockResolvedValue(false);
        vi.mocked(usePasskey).mockReturnValue(mockPasskey({ confirmIfNeeded }));

        render(<DisconnectButton connection={connection} label="Disconnect" />);
        await user.click(screen.getByText('Disconnect'));

        expect(confirmIfNeeded).toHaveBeenCalledOnce();
        expect(routerDelete).not.toHaveBeenCalled();
    });

    it('disconnects once the step-up is satisfied (reused within the window)', async () => {
        const user = userEvent.setup();
        vi.mocked(usePasskey).mockReturnValue(mockPasskey());

        render(<DisconnectButton connection={connection} label="Disconnect" />);
        await user.click(screen.getByText('Disconnect'));

        expect(routerDelete).toHaveBeenCalledWith(
            '/auth/connections/7',
            expect.anything(),
        );
    });

    it('shows a server-side step-up rejection returned to onError', async () => {
        const user = userEvent.setup();
        routerDelete.mockImplementation(
            (
                _url: string,
                opts: { onError?: (errors: Record<string, string>) => void },
            ) => opts.onError?.({ passkey: 'Please confirm your identity.' }),
        );
        vi.mocked(usePasskey).mockReturnValue(mockPasskey());

        render(<DisconnectButton connection={connection} label="Disconnect" />);
        await user.click(screen.getByText('Disconnect'));

        expect(
            await screen.findByText('Please confirm your identity.'),
        ).toBeInTheDocument();
    });
});
