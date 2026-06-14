import { Form, Head } from '@inertiajs/react';
import { SiBluesky, SiMastodon } from 'react-icons/si';
import Heading from '@/components/heading';
import InstanceCombobox from '@/components/InstanceCombobox';
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
    instance_url: string | null;
    auth_failed_at: string | null;
}

function BlueskyReauthForm({ connection }: { connection: SocialConnection }) {
    return (
        <div className="space-y-2">
            <p className="text-amber-600 text-sm">
                <strong>{connection.handle}</strong> — credentials expired
            </p>
            <Form {...bluesky.update.form(connection)}>
                {({ processing, errors }) => (
                    <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-1">
                            <Label htmlFor={`app_password_${connection.id}`}>
                                New app password
                            </Label>
                            <Input
                                id={`app_password_${connection.id}`}
                                name="app_password"
                                type="password"
                                placeholder="xxxx-xxxx-xxxx-xxxx"
                            />
                            <InputError message={errors.app_password} />
                        </div>
                        <Button
                            type="submit"
                            disabled={processing}
                            className="mt-6"
                        >
                            Reconnect
                        </Button>
                    </div>
                )}
            </Form>
            <Form {...disconnectAccount.form({ account: connection.id })}>
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
        </div>
    );
}

function MastodonReauthForm({ connection }: { connection: SocialConnection }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <p className="text-amber-600 text-sm">
                <strong>{connection.handle}</strong> — credentials expired
            </p>
            <div className="flex gap-2">
                <Form {...mastodon.reauth.form(connection)}>
                    {({ processing }) => (
                        <Button type="submit" disabled={processing} size="sm">
                            Reconnect
                        </Button>
                    )}
                </Form>
                <Form {...disconnectAccount.form({ account: connection.id })}>
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
            </div>
        </div>
    );
}

export default function Connections({
    connections,
    status,
}: {
    connections: SocialConnection[];
    status?: string;
}) {
    const mastodonConnections = connections.filter(
        (c) => c.provider === 'mastodon',
    );
    const blueskyConnections = connections.filter(
        (c) => c.provider === 'bluesky',
    );

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
                    <div className="font-medium text-green-600 text-sm">
                        Mastodon account connected.
                    </div>
                )}
                {status === 'mastodon-reconnected' && (
                    <div className="font-medium text-green-600 text-sm">
                        Mastodon account reconnected.
                    </div>
                )}
                {status === 'mastodon-disconnected' && (
                    <div className="font-medium text-green-600 text-sm">
                        Mastodon account disconnected.
                    </div>
                )}
                {status === 'mastodon-already-connected' && (
                    <div className="font-medium text-amber-600 text-sm">
                        That Mastodon account is already connected.
                    </div>
                )}
                {status === 'bluesky-connected' && (
                    <div className="font-medium text-green-600 text-sm">
                        Bluesky account connected.
                    </div>
                )}
                {status === 'bluesky-reconnected' && (
                    <div className="font-medium text-green-600 text-sm">
                        Bluesky account reconnected.
                    </div>
                )}
                {status === 'bluesky-disconnected' && (
                    <div className="font-medium text-green-600 text-sm">
                        Bluesky account disconnected.
                    </div>
                )}
                {status === 'bluesky-already-connected' && (
                    <div className="font-medium text-amber-600 text-sm">
                        That Bluesky account is already connected.
                    </div>
                )}

                {/* Mastodon */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                        <SiMastodon className="size-4" /> Mastodon
                    </h3>

                    {mastodonConnections.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Connected
                            </p>
                            <ul className="space-y-2">
                                {mastodonConnections.map((c) => (
                                    <li
                                        key={c.id}
                                        data-testid={`account-${c.id}`}
                                        className="rounded-md border px-3 py-2"
                                    >
                                        {c.auth_failed_at ? (
                                            <MastodonReauthForm
                                                connection={c}
                                            />
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <p className="text-muted-foreground text-sm">
                                                    <strong>{c.handle}</strong>
                                                    {c.instance_url && (
                                                        <span className="ml-1 text-xs">
                                                            ({c.instance_url})
                                                        </span>
                                                    )}
                                                </p>
                                                <Form
                                                    {...disconnectAccount.form({
                                                        account: c.id,
                                                    })}
                                                >
                                                    {({ processing }) => (
                                                        <Button
                                                            type="submit"
                                                            variant="destructive"
                                                            size="sm"
                                                            disabled={
                                                                processing
                                                            }
                                                        >
                                                            Disconnect
                                                        </Button>
                                                    )}
                                                </Form>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="rounded-md border bg-muted/50 p-4">
                        <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                            Add account
                        </p>
                        <Form
                            {...mastodon.redirect.form()}
                            className="space-y-3"
                        >
                            {({ processing, errors }) => (
                                <>
                                    <div className="space-y-1">
                                        <Label htmlFor="instance_url">
                                            Instance URL
                                        </Label>
                                        <InstanceCombobox
                                            id="instance_url"
                                            name="instance_url"
                                            placeholder="https://mastodon.social"
                                        />
                                        <InputError
                                            message={errors.instance_url}
                                        />
                                    </div>
                                    <Button type="submit" disabled={processing}>
                                        Connect Mastodon
                                    </Button>
                                </>
                            )}
                        </Form>
                    </div>
                </div>

                {/* Bluesky */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                        <SiBluesky className="size-4" /> Bluesky
                    </h3>

                    {blueskyConnections.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Connected
                            </p>
                            <ul className="space-y-2">
                                {blueskyConnections.map((c) => (
                                    <li
                                        key={c.id}
                                        data-testid={`account-${c.id}`}
                                        className="rounded-md border px-3 py-2"
                                    >
                                        {c.auth_failed_at ? (
                                            <BlueskyReauthForm connection={c} />
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <p className="text-muted-foreground text-sm">
                                                    <strong>{c.handle}</strong>
                                                </p>
                                                <Form
                                                    {...disconnectAccount.form({
                                                        account: c.id,
                                                    })}
                                                >
                                                    {({ processing }) => (
                                                        <Button
                                                            type="submit"
                                                            variant="destructive"
                                                            size="sm"
                                                            disabled={
                                                                processing
                                                            }
                                                        >
                                                            Disconnect
                                                        </Button>
                                                    )}
                                                </Form>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="rounded-md border bg-muted/50 p-4">
                        <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                            Add account
                        </p>
                        <Form {...bluesky.store.form()} className="space-y-3">
                            {({ processing, errors }) => (
                                <>
                                    <div className="space-y-1">
                                        <Label htmlFor="bsky_handle">
                                            Handle
                                        </Label>
                                        <Input
                                            id="bsky_handle"
                                            name="handle"
                                            placeholder="alice.bsky.social"
                                        />
                                        <InputError message={errors.handle} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="app_password">
                                            App Password
                                        </Label>
                                        <Input
                                            id="app_password"
                                            name="app_password"
                                            type="password"
                                            placeholder="xxxx-xxxx-xxxx-xxxx"
                                        />
                                        <InputError
                                            message={errors.app_password}
                                        />
                                        <p className="text-muted-foreground text-xs">
                                            Generate one at Settings &rarr;
                                            Privacy and Security &rarr; App
                                            Passwords in Bluesky.
                                        </p>
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="pds_url">
                                            PDS URL{' '}
                                            <span className="font-normal text-muted-foreground text-xs">
                                                (optional — leave blank for
                                                bsky.social)
                                            </span>
                                        </Label>
                                        <Input
                                            id="pds_url"
                                            name="pds_url"
                                            placeholder="https://bsky.social"
                                        />
                                        <InputError message={errors.pds_url} />
                                    </div>
                                    <Button type="submit" disabled={processing}>
                                        Connect Bluesky
                                    </Button>
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
