import { router, usePage } from '@inertiajs/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsePasskeyReturn } from '@/hooks/use-passkey';
import { usePasskey } from '@/hooks/use-passkey';
import { trackGoal } from '@/lib/matomo';
import PasskeySetup from './passkey-setup';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    router: { visit: vi.fn() },
    usePage: vi.fn(),
}));

vi.mock('@/hooks/use-passkey');

vi.mock('@/lib/matomo', () => ({
    trackGoal: vi.fn(),
}));

vi.mock('@/routes', () => ({
    dashboard: { url: () => '/dashboard' },
}));

const matomoConfig = {
    tracker_url: 'https://stat.istic.net',
    site_id: 3,
    goals: { registration: 1 },
};

const mockPasskey = (
    overrides: Partial<UsePasskeyReturn> = {},
): UsePasskeyReturn => ({
    isSupported: true,
    loading: false,
    error: null,
    register: vi.fn().mockResolvedValue(true),
    authenticate: vi.fn(),
    confirmIdentity: vi.fn().mockResolvedValue(true),
    startConditional: vi.fn(),
    abortConditional: vi.fn(),
    ...overrides,
});

beforeEach(() => {
    vi.mocked(trackGoal).mockClear();
    vi.mocked(router.visit).mockClear();
    vi.mocked(usePage).mockReturnValue({
        props: { matomo: matomoConfig },
    } as ReturnType<typeof usePage>);
});

describe('PasskeySetup', () => {
    it('fires the registration goal on successful first-time setup', async () => {
        const register = vi.fn().mockResolvedValue(true);
        vi.mocked(usePasskey).mockReturnValue(mockPasskey({ register }));

        render(<PasskeySetup />);
        fireEvent.click(
            screen.getByRole('button', { name: /set up passkey/i }),
        );

        await vi.waitFor(() => expect(register).toHaveResolvedWith(true));

        expect(trackGoal).toHaveBeenCalledWith(1);
        expect(router.visit).toHaveBeenCalledWith('/dashboard');
    });

    it('does not fire the registration goal when adding a passkey during recovery', async () => {
        const register = vi.fn().mockResolvedValue(true);
        vi.mocked(usePasskey).mockReturnValue(mockPasskey({ register }));

        render(<PasskeySetup status="recovery" />);
        fireEvent.click(
            screen.getByRole('button', { name: /set up passkey/i }),
        );

        await vi.waitFor(() => expect(register).toHaveResolvedWith(true));

        expect(trackGoal).not.toHaveBeenCalled();
        expect(router.visit).toHaveBeenCalledWith('/dashboard');
    });

    it('does not fire the registration goal when passkey registration fails', async () => {
        const register = vi.fn().mockResolvedValue(false);
        vi.mocked(usePasskey).mockReturnValue(mockPasskey({ register }));

        render(<PasskeySetup />);
        fireEvent.click(
            screen.getByRole('button', { name: /set up passkey/i }),
        );

        await vi.waitFor(() => expect(register).toHaveResolvedWith(false));

        expect(trackGoal).not.toHaveBeenCalled();
        expect(router.visit).not.toHaveBeenCalled();
    });
});
