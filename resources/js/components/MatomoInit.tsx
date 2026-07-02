import { router } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import type { MatomoConfig } from '@/lib/matomo';
import { initMatomo, trackPageView } from '@/lib/matomo';

export function MatomoInit({ matomo }: { matomo: MatomoConfig | null }) {
    const initializedRef = useRef(false);

    useEffect(() => {
        if (!matomo || initializedRef.current) {
            return;
        }

        initializedRef.current = true;
        initMatomo(matomo);
    }, [matomo]);

    useEffect(() => {
        if (!matomo) {
            return;
        }

        return router.on('navigate', () => trackPageView());
    }, [matomo]);

    return null;
}
