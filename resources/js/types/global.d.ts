import type { MatomoConfig } from '@/lib/matomo';
import type { Auth } from '@/types/auth';

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            /** Epoch-ms until a recent passkey confirmation stays valid for step-up actions, or null. */
            passkeyConfirmedUntil: number | null;
            sidebarOpen: boolean;
            appVersion: { label: string; url: string | null } | null;
            matomo: MatomoConfig | null;
            [key: string]: unknown;
        };
    }
}
