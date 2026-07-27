import { router } from '@inertiajs/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsePasskeyReturn } from '@/hooks/use-passkey';
import { usePasskey } from '@/hooks/use-passkey';
import PasskeyList from './passkey-list';

const { routerDelete, routerReload } = vi.hoisted(() => ({
    routerDelete: vi.fn(),
    routerReload: vi.fn(),
}));

vi.mock('@inertiajs/react', () => ({
    router: { delete: routerDelete, reload: routerReload },
}));

vi.mock('@/hooks/use-passkey');

vi.mock('@/routes/passkey', () => ({
    destroy: {
        url: ({ passkey }: { passkey: string }) => `/settings/passkeys/${passkey}`,
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

const passkey = {
    id: 'pk-1',
    name: 'MacBook',
    last_used_at: null,
    created_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
    routerDelete.mockClear();
    routerReload.mockClear();
});

describe('PasskeyList step-up gating', () => {
    it('does not issue the delete when the fresh-tap confirmation is declined', async () => {
        const user = userEvent.setup();
        const confirmIdentity = vi.fn().mockResolvedValue(false);
        vi.mocked(usePasskey).mockReturnValue(mockPasskey({ confirmIdentity }));

        render(<PasskeyList passkeys={[passkey]} />);
        await user.click(screen.getByRole('button', { name: /remove macbook/i }));

        expect(confirmIdentity).toHaveBeenCalledOnce();
        expect(routerDelete).not.toHaveBeenCalled();
    });

    it('issues the delete once the fresh tap is confirmed', async () => {
        const user = userEvent.setup();
        vi.mocked(usePasskey).mockReturnValue(mockPasskey());

        render(<PasskeyList passkeys={[passkey]} />);
        await user.click(screen.getByRole('button', { name: /remove macbook/i }));

        expect(routerDelete).toHaveBeenCalledWith(
            '/settings/passkeys/pk-1',
            expect.anything(),
        );
    });

    it('surfaces a server-side step-up rejection returned to onError', async () => {
        const user = userEvent.setup();
        routerDelete.mockImplementation(
            (
                _url: string,
                opts: { onError?: (errors: Record<string, string>) => void },
            ) => opts.onError?.({ passkey: 'Please confirm your identity.' }),
        );
        vi.mocked(usePasskey).mockReturnValue(mockPasskey());

        render(<PasskeyList passkeys={[passkey]} />);
        await user.click(screen.getByRole('button', { name: /remove macbook/i }));

        expect(
            await screen.findByText('Please confirm your identity.'),
        ).toBeInTheDocument();
    });

    it('does not register a new passkey when the fresh tap is declined', async () => {
        const user = userEvent.setup();
        const confirmIdentity = vi.fn().mockResolvedValue(false);
        const register = vi.fn().mockResolvedValue(true);
        vi.mocked(usePasskey).mockReturnValue(
            mockPasskey({ confirmIdentity, register }),
        );

        render(<PasskeyList passkeys={[passkey]} />);
        await user.click(screen.getByRole('button', { name: 'Add passkey' }));
        await user.type(screen.getByLabelText('Passkey name'), 'iPhone');
        await user.click(screen.getByRole('button', { name: 'Add' }));

        expect(confirmIdentity).toHaveBeenCalledOnce();
        expect(register).not.toHaveBeenCalled();
    });
});
