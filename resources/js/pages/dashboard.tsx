import { Head, Link } from '@inertiajs/react';
import { PlaceholderPattern } from '@/components/ui/placeholder-pattern';
import { dashboard, feed } from '@/routes';
import { edit as editConnections } from '@/routes/connections';

export default function Dashboard() {
    return (
        <>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex flex-col items-center justify-center gap-4 py-8">
                    <Link
                        href={feed().url}
                        className="rounded-lg bg-black px-8 py-4 text-lg font-bold text-white transition hover:bg-gray-900 dark:bg-white dark:text-black dark:hover:bg-gray-100"
                    >
                        Open Feed →
                    </Link>
                    <Link
                        href={editConnections().url}
                        className="text-sm text-muted-foreground underline"
                    >
                        Manage connected accounts
                    </Link>
                </div>
                <div className="relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border border-sidebar-border/70 md:min-h-min dark:border-sidebar-border">
                    <PlaceholderPattern className="absolute inset-0 size-full stroke-neutral-900/20 dark:stroke-neutral-100/20" />
                </div>
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: dashboard(),
        },
    ],
};
