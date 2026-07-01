import { Form, Head, useForm } from '@inertiajs/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { SiBluesky, SiMastodon } from 'react-icons/si';
import Heading from '@/components/heading';
import InstanceCombobox from '@/components/InstanceCombobox';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import bluesky from '@/routes/bluesky';
import { destroy as disconnectAccount, edit } from '@/routes/connections';
import blueskyFeed from '@/routes/connections/bluesky-feed';
import publicMastodon from '@/routes/connections/public-mastodon';
import mastodon from '@/routes/mastodon';

interface SocialConnection {
    id: number;
    provider: 'mastodon' | 'bluesky';
    feed_type: 'home' | 'public_mastodon' | 'bluesky_feed';
    handle: string | null;
    instance_url: string | null;
    auth_failed_at: string | null;
    feed_settings: {
        max_posts?: number;
        max_age_days?: number | null;
        feed_uri?: string;
    } | null;
}

function AccountFeedSettings({ connection }: { connection: SocialConnection }) {
    const [open, setOpen] = useState(false);
    const { data, setData, put, processing } = useForm({
        max_posts: connection.feed_settings?.max_posts ?? 20,
        max_age_days: connection.feed_settings?.max_age_days ?? null,
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        put(`/settings/connections/${connection.id}/feed`);
    }

    return (
        <div className="mt-2 border-t pt-2">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            >
                {open ? (
                    <ChevronUp className="h-3 w-3" />
                ) : (
                    <ChevronDown className="h-3 w-3" />
                )}
                Feed settings
            </button>
            {open && (
                <form onSubmit={submit} className="mt-3 space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="space-y-1">
                            <Label
                                htmlFor={`max_posts_${connection.id}`}
                                className="text-xs"
                            >
                                Max posts
                            </Label>
                            <Input
                                id={`max_posts_${connection.id}`}
                                type="number"
                                min={1}
                                max={100}
                                value={data.max_posts}
                                onChange={(e) =>
                                    setData('max_posts', Number(e.target.value))
                                }
                                className="h-8 w-20 text-sm"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label
                                htmlFor={`max_age_${connection.id}`}
                                className="text-xs"
                            >
                                Age cutoff (days)
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id={`max_age_${connection.id}`}
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={data.max_age_days ?? ''}
                                    onChange={(e) =>
                                        setData(
                                            'max_age_days',
                                            e.target.value === ''
                                                ? null
                                                : Number(e.target.value),
                                        )
                                    }
                                    className="h-8 w-20 text-sm"
                                    placeholder="inherit"
                                    disabled={data.max_age_days === null}
                                />
                                <label className="flex items-center gap-1 text-muted-foreground text-xs">
                                    <input
                                        type="checkbox"
                                        checked={data.max_age_days === null}
                                        onChange={(e) =>
                                            setData(
                                                'max_age_days',
                                                e.target.checked ? null : 7,
                                            )
                                        }
                                    />
                                    Inherit
                                </label>
                            </div>
                        </div>
                    </div>
                    <Button type="submit" size="sm" disabled={processing}>
                        Save
                    </Button>
                </form>
            )}
        </div>
    );
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

function DisconnectButton({ connection }: { connection: SocialConnection }) {
    return (
        <Form {...disconnectAccount.form({ account: connection.id })}>
            {({ processing }) => (
                <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={processing}
                >
                    Remove
                </Button>
            )}
        </Form>
    );
}

export default function Connections({
    connections,
    status,
}: {
    connections: SocialConnection[];
    status?: string;
}) {
    const mastodonHome = connections.filter(
        (c) => c.provider === 'mastodon' && c.feed_type === 'home',
    );
    const mastodonPublic = connections.filter(
        (c) => c.provider === 'mastodon' && c.feed_type === 'public_mastodon',
    );
    const blueskyHome = connections.filter(
        (c) => c.provider === 'bluesky' && c.feed_type === 'home',
    );
    const blueskyFeeds = connections.filter(
        (c) => c.provider === 'bluesky' && c.feed_type === 'bluesky_feed',
    );

    const hasBlueskyHomeAccount = blueskyHome.length > 0;

    return (
        <SettingsPageLayout>
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
                {status === 'public-mastodon-added' && (
                    <div className="font-medium text-green-600 text-sm">
                        Public Mastodon timeline added.
                    </div>
                )}
                {status === 'public-mastodon-already-added' && (
                    <div className="font-medium text-amber-600 text-sm">
                        That public timeline is already added.
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
                {status === 'bluesky-feed-added' && (
                    <div className="font-medium text-green-600 text-sm">
                        Bluesky algorithmic feed added.
                    </div>
                )}
                {status === 'bluesky-feed-already-added' && (
                    <div className="font-medium text-amber-600 text-sm">
                        That Bluesky feed is already added.
                    </div>
                )}

                {/* Mastodon */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                        <SiMastodon className="size-4" /> Mastodon
                    </h3>

                    {mastodonHome.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Connected accounts
                            </p>
                            <ul className="space-y-2">
                                {mastodonHome.map((c) => (
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
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-muted-foreground text-sm">
                                                        <strong>
                                                            {c.handle}
                                                        </strong>
                                                        {c.instance_url && (
                                                            <span className="ml-1 text-xs">
                                                                (
                                                                {c.instance_url}
                                                                )
                                                            </span>
                                                        )}
                                                    </p>
                                                    <Form
                                                        {...disconnectAccount.form(
                                                            {
                                                                account: c.id,
                                                            },
                                                        )}
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
                                                <AccountFeedSettings
                                                    connection={c}
                                                />
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {mastodonPublic.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Public timelines
                            </p>
                            <ul className="space-y-2">
                                {mastodonPublic.map((c) => (
                                    <li
                                        key={c.id}
                                        data-testid={`account-${c.id}`}
                                        className="flex items-center justify-between rounded-md border px-3 py-2"
                                    >
                                        <p className="text-muted-foreground text-sm">
                                            {c.instance_url}
                                            {c.auth_failed_at && (
                                                <span className="ml-2 text-amber-600 text-xs">
                                                    (requires auth — add account
                                                    above)
                                                </span>
                                            )}
                                        </p>
                                        <DisconnectButton connection={c} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="space-y-3">
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
                                        <Button
                                            type="submit"
                                            disabled={processing}
                                        >
                                            Connect Mastodon
                                        </Button>
                                    </>
                                )}
                            </Form>
                        </div>

                        <div className="rounded-md border bg-muted/50 p-4">
                            <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Add public timeline
                            </p>
                            <p className="mb-3 text-muted-foreground text-xs">
                                Follow any instance's public timeline without an
                                account.
                            </p>
                            <Form
                                {...publicMastodon.store.form()}
                                className="space-y-3"
                            >
                                {({ processing, errors }) => (
                                    <>
                                        <div className="space-y-1">
                                            <Label htmlFor="public_instance_url">
                                                Instance URL
                                            </Label>
                                            <Input
                                                id="public_instance_url"
                                                name="instance_url"
                                                placeholder="https://mastodon.social"
                                            />
                                            <InputError
                                                message={errors.instance_url}
                                            />
                                        </div>
                                        <Button
                                            type="submit"
                                            disabled={processing}
                                        >
                                            Add timeline
                                        </Button>
                                    </>
                                )}
                            </Form>
                        </div>
                    </div>
                </div>

                {/* Bluesky */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                        <SiBluesky className="size-4" /> Bluesky
                    </h3>

                    {blueskyHome.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Connected accounts
                            </p>
                            <ul className="space-y-2">
                                {blueskyHome.map((c) => (
                                    <li
                                        key={c.id}
                                        data-testid={`account-${c.id}`}
                                        className="rounded-md border px-3 py-2"
                                    >
                                        {c.auth_failed_at ? (
                                            <BlueskyReauthForm connection={c} />
                                        ) : (
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <p className="text-muted-foreground text-sm">
                                                        <strong>
                                                            {c.handle}
                                                        </strong>
                                                    </p>
                                                    <Form
                                                        {...disconnectAccount.form(
                                                            {
                                                                account: c.id,
                                                            },
                                                        )}
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
                                                <AccountFeedSettings
                                                    connection={c}
                                                />
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {blueskyFeeds.length > 0 && (
                        <div className="mb-4">
                            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Algorithmic feeds
                            </p>
                            <ul className="space-y-2">
                                {blueskyFeeds.map((c) => (
                                    <li
                                        key={c.id}
                                        data-testid={`account-${c.id}`}
                                        className="flex items-center justify-between rounded-md border px-3 py-2"
                                    >
                                        <p className="font-mono text-muted-foreground text-xs">
                                            {c.feed_settings?.feed_uri}
                                        </p>
                                        <DisconnectButton connection={c} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="space-y-3">
                        <div className="rounded-md border bg-muted/50 p-4">
                            <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                Add account
                            </p>
                            <Form
                                {...bluesky.store.form()}
                                className="space-y-3"
                            >
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
                                            <InputError
                                                message={errors.handle}
                                            />
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
                                            <InputError
                                                message={errors.pds_url}
                                            />
                                        </div>
                                        <Button
                                            type="submit"
                                            disabled={processing}
                                        >
                                            Connect Bluesky
                                        </Button>
                                    </>
                                )}
                            </Form>
                        </div>

                        {hasBlueskyHomeAccount && (
                            <div className="rounded-md border bg-muted/50 p-4">
                                <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                                    Add algorithmic feed
                                </p>
                                <p className="mb-3 text-muted-foreground text-xs">
                                    Subscribe to a Bluesky curated feed. Paste
                                    the feed URL from bsky.app.
                                </p>
                                <Form
                                    {...blueskyFeed.store.form()}
                                    className="space-y-3"
                                >
                                    {({ processing, errors }) => (
                                        <>
                                            <div className="space-y-1">
                                                <Label htmlFor="feed_url">
                                                    Feed URL
                                                </Label>
                                                <Input
                                                    id="feed_url"
                                                    name="feed_url"
                                                    placeholder="https://bsky.app/profile/did:plc:.../feed/..."
                                                />
                                                <InputError
                                                    message={errors.feed_url}
                                                />
                                            </div>
                                            <Button
                                                type="submit"
                                                disabled={processing}
                                            >
                                                Add feed
                                            </Button>
                                        </>
                                    )}
                                </Form>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </SettingsPageLayout>
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
