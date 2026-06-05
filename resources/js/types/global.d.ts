import type { Auth } from '@/types/auth';

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            sidebarOpen: boolean;
            appVersion: { label: string; url: string | null } | null;
            [key: string]: unknown;
        };
    }
}
