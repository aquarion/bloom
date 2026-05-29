import { Form, Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import bluesky from '@/routes/bluesky';
import { destroy as disconnectAccount, edit } from '@/routes/connections';
import mastodon from '@/routes/mastodon';

interface SocialConnection {
    id: number;
    provider: 'mastodon' | 'bluesky';
    handle: string;
    instance_url: string;
    auth_failed_at: string | null;
}

export default function Connections({
    connections,
    status,
}: {
    connections: SocialConnection[];
    status?: string;
}) {
    const mastodonConnections = connections.filter((c) => c.provider === 'mastodon');
    const blueskyConnections = connections.filter((c) => c.provider === 'bluesky');

    return (
        <>
            <Head title="Connected accounts" />

            <h1 className="sr-only">Connected accounts</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Connected accounts"
                    description="Connect your Mastodon and Bluesky accounts to populate your feed."
                />

                {status === 'mastodon-connected' && (
                    <div className="text-sm font-medium text-green-600">Mastodon account connected.</div>
                )}
                {status === 'mastodon-disconnected' && (
                    <div className="text-sm font-medium text-green-600">Mastodon account disconnected.</div>
                )}
                {status === 'mastodon-already-connected' && (
                    <div className="text-sm font-medium text-amber-600">That Mastodon account is already connected.</div>
                )}
                {status === 'bluesky-connected' && (
                    <div className="text-sm font-medium text-green-600">Bluesky account connected.</div>
                )}
                {status === 'bluesky-disconnected' && (
                    <div className="text-sm font-medium text-green-600">Bluesky account disconnected.</div>
                )}
                {status === 'bluesky-already-connected' && (
                    <div className="text-sm font-medium text-amber-600">That Bluesky account is already connected.</div>
                )}

                {/* Mastodon */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 text-base font-semibold">Mastodon</h3>

                    {mastodonConnections.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected</p>
                            <ul className="space-y-2">
                                {mastodonConnections.map((c) => (
                                    <li key={c.id} dusk={`account-${c.id}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                                        {c.auth_failed_at ? (
                                            <p className="text-sm text-amber-600">
                                                <strong>{c.handle}</strong> — needs reconnecting (credentials expired)
                                            </p>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                <strong>{c.handle}</strong>
                                                <span className="ml-1 text-xs">({c.instance_url})</span>
                                            </p>
                                        )}
                                        <Form {...disconnectAccount.form({ account: c.id })}>
                                            {({ processing }) => (
                                                <Button
                                                    type="submit"
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={processing}
                                                >
                                                    Disconnect
                                                </Button>
                                            )}
                                        </Form>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="rounded-md border bg-muted/50 p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add account</p>
                        <form action={mastodon.redirect.url()} method="post" className="space-y-3">
                            <input type="hidden" name="_token" value={document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content} />
                            <div className="space-y-1">
                                <Label htmlFor="instance_url">Instance URL</Label>
                                <Input
                                    id="instance_url"
                                    name="instance_url"
                                    placeholder="https://mastodon.social"
                                />
                            </div>
                            <Button type="submit">Connect Mastodon</Button>
                        </form>
                    </div>
                </div>

                {/* Bluesky */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 text-base font-semibold">Bluesky</h3>

                    {blueskyConnections.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connected</p>
                            <ul className="space-y-2">
                                {blueskyConnections.map((c) => (
                                    <li key={c.id} dusk={`account-${c.id}`} className="flex items-center justify-between rounded-md border px-3 py-2">
                                        {c.auth_failed_at ? (
                                            <p className="text-sm text-amber-600">
                                                <strong>{c.handle}</strong> — needs reconnecting (credentials expired)
                                            </p>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                <strong>{c.handle}</strong>
                                            </p>
                                        )}
                                        <Form {...disconnectAccount.form({ account: c.id })}>
                                            {({ processing }) => (
                                                <Button
                                                    type="submit"
                                                    variant="destructive"
                                                    size="sm"
                                                    disabled={processing}
                                                >
                                                    Disconnect
                                                </Button>
                                            )}
                                        </Form>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="rounded-md border bg-muted/50 p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add account</p>
                        <Form {...bluesky.store.form()} className="space-y-3">
                            {({ processing, errors }) => (
                                <>
                                    <div className="space-y-1">
                                        <Label htmlFor="bsky_handle">Handle</Label>
                                        <Input
                                            id="bsky_handle"
                                            name="handle"
                                            placeholder="alice.bsky.social"
                                        />
                                        <InputError message={errors.handle} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="app_password">App Password</Label>
                                        <Input
                                            id="app_password"
                                            name="app_password"
                                            type="password"
                                            placeholder="xxxx-xxxx-xxxx-xxxx"
                                        />
                                        <InputError message={errors.app_password} />
                                        <p className="text-xs text-muted-foreground">
                                            Generate one at Settings &rarr; Privacy and Security &rarr; App Passwords in Bluesky.
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="pds_url">
                                            PDS URL{' '}
                                            <span className="text-xs font-normal text-muted-foreground">(optional — leave blank for bsky.social)</span>
                                        </Label>
                                        <Input
                                            id="pds_url"
                                            name="pds_url"
                                            placeholder="https://bsky.social"
                                        />
                                        <InputError message={errors.pds_url} />
                                    </div>
                                    <Button type="submit" disabled={processing}>Connect Bluesky</Button>
                                </>
                            )}
                        </Form>
                    </div>
                </div>
            </div>
        </>
    );
}

Connections.layout = {
    breadcrumbs: [
        {
            title: 'Connected accounts',
            href: edit(),
        },
    ],
};
