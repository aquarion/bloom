import { createInertiaApp } from '@inertiajs/react';
import { initOtelBrowserErrors } from '@istic-co/otel-browser-errors';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MatomoInit } from '@/components/MatomoInit';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

let currentUserId: string | undefined;
let currentRoute: string | undefined;

initOtelBrowserErrors({
    endpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: 'bloom-frontend',
    serviceVersion: import.meta.env.VITE_APP_VERSION,
    getContext: () => ({ route: currentRoute, userId: currentUserId }),
});

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
    withApp(app, { page }) {
        currentRoute = page.url;
        currentUserId = (
            page.props.auth as { user?: { id: number } | null } | undefined
        )?.user?.id?.toString();

        return (
            <ErrorBoundary>
                <TooltipProvider delayDuration={0}>
                    <MatomoInit matomo={page.props.matomo} />
                    {app}
                    <Toaster />
                </TooltipProvider>
            </ErrorBoundary>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
