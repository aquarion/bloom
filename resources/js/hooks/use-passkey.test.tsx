import { router } from '@inertiajs/react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePasskey } from '@/hooks/use-passkey';

vi.mock('@inertiajs/react', () => ({
    router: { visit: vi.fn() },
    usePage: () => ({ props: {} }),
}));

vi.mock('@/lib/csrf', () => ({ getXsrfToken: () => 'test-token' }));

vi.mock('@/routes', () => ({ dashboard: { url: () => '/dashboard' } }));

vi.mock('@/routes/passkey', () => ({
    confirm: { url: () => '/passkey/confirm' },
}));

vi.mock('@/routes/passkey/auth', () => ({
    authenticate: { url: () => '/passkey/authenticate' },
    options: { url: () => '/passkey/auth/options' },
}));

vi.mock('@/routes/passkey/confirm', () => ({
    options: { url: () => '/passkey/confirm/options' },
}));

vi.mock('@/routes/passkey/register', () => ({
    options: { url: () => '/passkey/register/options' },
    store: { url: () => '/passkey/register' },
}));

describe('usePasskey authenticate', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        Object.defineProperty(window, 'PublicKeyCredential', {
            value: vi.fn(),
            configurable: true,
            writable: true,
        });

        // jsdom does not define the WebAuthn response classes that
        // serializeCredential checks with `instanceof`; stub them so the
        // assertion serialization mirrors a real browser.
        class AssertionResponse {
            authenticatorData = new ArrayBuffer(1);
            clientDataJSON = new ArrayBuffer(1);
            signature = new ArrayBuffer(1);
            userHandle: ArrayBuffer | null = null;
        }
        globalThis.AuthenticatorAttestationResponse =
            class {} as unknown as typeof AuthenticatorAttestationResponse;
        globalThis.AuthenticatorAssertionResponse =
            AssertionResponse as unknown as typeof AuthenticatorAssertionResponse;

        Object.defineProperty(navigator, 'credentials', {
            value: {
                get: vi.fn().mockResolvedValue({
                    id: 'credential-id',
                    rawId: new ArrayBuffer(8),
                    type: 'public-key',
                    response: new AssertionResponse(),
                }),
            },
            configurable: true,
        });

        globalThis.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                headers: { get: () => null },
                json: async () => ({ challenge: 'AAAA', allowCredentials: [] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ redirect: '/feed' }),
            }) as unknown as typeof fetch;
    });

    it('keeps loading true until the Inertia visit finishes', async () => {
        let finishVisit: (() => void) | undefined;

        vi.mocked(router.visit).mockImplementation((_url, options) => {
            finishVisit = options?.onFinish as (() => void) | undefined;
        });

        const { result } = renderHook(() => usePasskey());

        let authPromise: Promise<void> | undefined;
        act(() => {
            authPromise = result.current.authenticate();
        });

        // Wait for the assertion round-trip to reach the navigation step.
        await waitFor(() => {
            expect(router.visit).toHaveBeenCalledWith(
                '/feed',
                expect.objectContaining({ onFinish: expect.any(Function) }),
            );
        });

        // The spinner must persist while the destination page is still loading.
        expect(result.current.loading).toBe(true);

        // Once Inertia reports the visit finished, loading is released.
        act(() => {
            finishVisit?.();
        });
        await act(async () => {
            await authPromise;
        });

        expect(result.current.loading).toBe(false);
    });

    it('releases loading when authentication is cancelled without a credential', async () => {
        vi.mocked(navigator.credentials.get).mockResolvedValueOnce(
            null as unknown as Credential,
        );

        const { result } = renderHook(() => usePasskey());

        await act(async () => {
            await result.current.authenticate();
        });

        expect(router.visit).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(false);
    });
});
