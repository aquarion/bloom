import { Head, Link } from '@inertiajs/react';
import { Rss, Settings, Users } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { dashboard, feed } from '@/routes';
import { edit as editConnections } from '@/routes/connections';
import { edit as editProfile } from '@/routes/profile';

export default function Dashboard() {
    return (
        <>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="px-1 py-4">
                    <h1 className="text-2xl font-bold tracking-tight">Welcome to Sprouter</h1>
                    <p className="mt-1 text-muted-foreground">
                        A full-screen, auto-advancing social media reader for Mastodon and Bluesky. Connect your
                        accounts, then open the feed to watch posts cycle through with animated text.
                    </p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Link href={feed().url}>
                        <Card className="h-full transition-colors hover:bg-muted/50">
                            <CardHeader>
                                <Rss className="mb-2 size-6" />
                                <CardTitle>Feed</CardTitle>
                                <CardDescription>View your social media feed</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                    <Link href={editConnections().url}>
                        <Card className="h-full transition-colors hover:bg-muted/50">
                            <CardHeader>
                                <Users className="mb-2 size-6" />
                                <CardTitle>Accounts</CardTitle>
                                <CardDescription>Manage your connected social accounts</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                    <Link href={editProfile().url}>
                        <Card className="h-full transition-colors hover:bg-muted/50">
                            <CardHeader>
                                <Settings className="mb-2 size-6" />
                                <CardTitle>Settings</CardTitle>
                                <CardDescription>Update your profile and preferences</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
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
