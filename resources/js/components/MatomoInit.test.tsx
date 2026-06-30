import { router } from '@inertiajs/react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatomoConfig } from '@/lib/matomo';
import { initMatomo, trackPageView } from '@/lib/matomo';
import { MatomoInit } from './MatomoInit';

vi.mock('@inertiajs/react', () => ({
    router: {
        on: vi.fn(() => vi.fn()),
    },
}));

vi.mock('@/lib/matomo', () => ({
    initMatomo: vi.fn(),
    trackPageView: vi.fn(),
}));

const config: MatomoConfig = {
    tracker_url: 'https://stat.istic.net',
    site_id: 3,
    goals: { registration: 1 },
};

beforeEach(() => {
    vi.mocked(initMatomo).mockClear();
    vi.mocked(trackPageView).mockClear();
    vi.mocked(router.on).mockClear();
    vi.mocked(router.on).mockReturnValue(vi.fn());
});

describe('MatomoInit', () => {
    it('does not initialise matomo when config is null', () => {
        render(<MatomoInit matomo={null} />);

        expect(initMatomo).not.toHaveBeenCalled();
    });

    it('initialises matomo once when config is provided', () => {
        const { rerender } = render(<MatomoInit matomo={config} />);

        expect(initMatomo).toHaveBeenCalledTimes(1);
        expect(initMatomo).toHaveBeenCalledWith(config);

        rerender(<MatomoInit matomo={config} />);

        expect(initMatomo).toHaveBeenCalledTimes(1);
    });

    it('subscribes to router navigate events and tracks page views', () => {
        render(<MatomoInit matomo={config} />);

        expect(router.on).toHaveBeenCalledWith(
            'navigate',
            expect.any(Function),
        );

        const [, callback] = vi.mocked(router.on).mock.calls[0];
        (callback as () => void)();

        expect(trackPageView).toHaveBeenCalledTimes(1);
    });

    it('unsubscribes from navigate events on unmount', () => {
        const unsubscribe = vi.fn();
        vi.mocked(router.on).mockReturnValue(unsubscribe);

        const { unmount } = render(<MatomoInit matomo={config} />);
        unmount();

        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
});
