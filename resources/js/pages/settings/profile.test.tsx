import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsePasskeyReturn } from '@/hooks/use-passkey';
import { usePasskey } from '@/hooks/use-passkey';
import Profile from './profile';

const { patchMock, formState } = vi.hoisted(() => ({
    patchMock: vi.fn(),
    formState: { errors: {} as Record<string, string> },
}));

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        children,
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => <a href={typeof href === 'string' ? href : href.url}>{children}</a>,
    useForm: (initial: Record<string, unknown>) => {
        const [data, setData] = useState(initial);

        return {
            data,
            setData: (key: string, value: unknown) =>
                setData((prev) => ({ ...prev, [key]: value })),
            patch: patchMock,
            errors: formState.errors,
            processing: false,
        };
    },
    usePage: () => ({
        props: {
            auth: {
                user: { name: 'Alice', email: 'alice@example.com', roles: [] },
            },
        },
    }),
}));

vi.mock('@/hooks/use-passkey');

vi.mock('@/actions/App/Http/Controllers/Settings/ProfileController', () => ({
    default: { update: { url: () => '/settings/profile' } },
}));

vi.mock('@/actions/App/Http/Controllers/Settings/BetaTesterController', () => ({
    default: { update: { url: () => '/settings/profile/beta-tester' } },
}));

vi.mock('@/components/delete-user', () => ({ default: () => null }));

vi.mock('@/layouts/settings-page-layout', () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/routes/docs', () => ({
    default: { show: () => ({ url: '/docs/changelog' }) },
}));

vi.mock('@/routes/profile', () => ({
    edit: () => ({ url: '/settings/profile' }),
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

beforeEach(() => {
    patchMock.mockClear();
    formState.errors = {};
});

describe('Profile step-up gating', () => {
    it('does not submit the profile update when step-up is declined', async () => {
        const user = userEvent.setup();
        const confirmIfNeeded = vi.fn().mockResolvedValue(false);
        vi.mocked(usePasskey).mockReturnValue(mockPasskey({ confirmIfNeeded }));

        render(<Profile />);
        await user.click(
            document.querySelector(
                '[data-test="update-profile-button"]',
            ) as HTMLElement,
        );

        expect(confirmIfNeeded).toHaveBeenCalledOnce();
        expect(patchMock).not.toHaveBeenCalled();
    });

    it('submits the profile update once step-up is satisfied', async () => {
        const user = userEvent.setup();
        vi.mocked(usePasskey).mockReturnValue(mockPasskey());

        render(<Profile />);
        await user.click(
            document.querySelector(
                '[data-test="update-profile-button"]',
            ) as HTMLElement,
        );

        expect(patchMock).toHaveBeenCalledWith(
            '/settings/profile',
            expect.anything(),
        );
    });

    it('renders a server-side step-up rejection from the error bag', () => {
        formState.errors = { passkey: 'Please confirm your identity.' };
        vi.mocked(usePasskey).mockReturnValue(mockPasskey());

        render(<Profile />);

        expect(
            screen.getByText('Please confirm your identity.'),
        ).toBeInTheDocument();
    });
});
