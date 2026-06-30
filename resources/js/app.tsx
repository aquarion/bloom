import { createInertiaApp, router, usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';
import { initMatomo, trackPageView } from '@/lib/matomo';

function MatomoInit() {
    const { matomo } = usePage().props;
    const initializedRef = useRef(false);

    useEffect(() => {
        if (!matomo || initializedRef.current) {
            return;
        }

        initializedRef.current = true;
        initMatomo(matomo);
    }, [matomo]);

    useEffect(() => {
        return router.on('navigate', () => trackPageView());
    }, []);

    return null;
}

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} — ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            case name === 'welcome':
            case name === 'feed':
                return null;
            case name.startsWith('auth/'):
                return AuthLayout;
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    withApp(app) {
        return (
            <TooltipProvider delayDuration={0}>
                <MatomoInit />
                {app}
                <Toaster />
            </TooltipProvider>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
