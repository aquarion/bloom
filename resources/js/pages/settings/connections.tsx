import { Form, Head, Link } from '@inertiajs/react';
import { SiBluesky, SiMastodon } from 'react-icons/si';
import Heading from '@/components/heading';
import InstanceCombobox from '@/components/InstanceCombobox';
import InputError from '@/components/input-error';
import type {
    BlueskyConnection,
    MastodonConnection,
    ProviderSectionConfig,
    SocialConnection,
} from '@/components/settings/provider-section';
import {
    BlueskyReauthForm,
    MastodonReauthForm,
    ProviderSection,
} from '@/components/settings/provider-section';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import bluesky from '@/routes/bluesky';
import { edit } from '@/routes/connections';
import blueskyFeeds from '@/routes/connections/bluesky-feeds';
import publicMastodon from '@/routes/connections/public-mastodon';
import mastodon from '@/routes/mastodon';

const STATUS_MESSAGES: Record<
    string,
    { tone: 'success' | 'warning'; text: string }
> = {
    'mastodon-connected': {
        tone: 'success',
        text: 'Mastodon account connected.',
    },
    'mastodon-reconnected': {
        tone: 'success',
        text: 'Mastodon account reconnected.',
    },
    'mastodon-disconnected': {
        tone: 'success',
        text: 'Mastodon account disconnected.',
    },
    'mastodon-already-connected': {
        tone: 'warning',
        text: 'That Mastodon account is already connected.',
    },
    'public-mastodon-added': {
        tone: 'success',
        text: 'Public Mastodon timeline added.',
    },
    'public-mastodon-already-added': {
        tone: 'warning',
        text: 'That public timeline is already added.',
    },
    'bluesky-connected': {
        tone: 'success',
        text: 'Bluesky account connected.',
    },
    'bluesky-reconnected': {
        tone: 'success',
        text: 'Bluesky account reconnected.',
    },
    'bluesky-disconnected': {
        tone: 'success',
        text: 'Bluesky account disconnected.',
    },
    'bluesky-already-connected': {
        tone: 'warning',
        text: 'That Bluesky account is already connected.',
    },
    'bluesky-feed-added': {
        tone: 'success',
        text: 'Bluesky algorithmic feed added.',
    },
    'bluesky-feed-already-added': {
        tone: 'warning',
        text: 'That Bluesky feed is already added.',
    },
};

export default function Connections({
    connections,
    status,
}: {
    connections: SocialConnection[];
    status?: string;
}) {
    const mastodonHome = connections.filter(
        (c): c is MastodonConnection =>
            c.provider === 'mastodon' && c.feed_type === 'home',
    );
    const mastodonPublic = connections.filter(
        (c): c is MastodonConnection =>
            c.provider === 'mastodon' && c.feed_type === 'public_mastodon',
    );
    const blueskyHome = connections.filter(
        (c): c is BlueskyConnection =>
            c.provider === 'bluesky' && c.feed_type === 'home',
    );
    const blueskyFeedConnections = connections.filter(
        (c): c is BlueskyConnection =>
            c.provider === 'bluesky' && c.feed_type === 'bluesky_feed',
    );

    const hasBlueskyHomeAccount = blueskyHome.length > 0;

    const mastodonConfig: ProviderSectionConfig<MastodonConnection> = {
        icon: <SiMastodon className="size-4" />,
        label: 'Mastodon',
        primary: {
            heading: 'Connected accounts',
            connections: mastodonHome,
            ReauthForm: MastodonReauthForm,
            showFeedSettings: true,
            renderLabel: (c) => (
                <>
                    <strong>{c.handle}</strong>
                    {c.instance_url && (
                        <span className="ml-1 text-xs">({c.instance_url})</span>
                    )}
                </>
            ),
            addForm: (
                <div className="rounded-md border bg-muted/50 p-4">
                    <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        Add account
                    </p>
                    <Form {...mastodon.redirect.form()} className="space-y-3">
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
                                    <InputError message={errors.instance_url} />
                                </div>
                                <Button type="submit" disabled={processing}>
                                    Connect Mastodon
                                </Button>
                            </>
                        )}
                    </Form>
                </div>
            ),
        },
        secondary: {
            heading: 'Public timelines',
            connections: mastodonPublic,
            renderLabel: (c) => (
                <p className="text-muted-foreground text-sm">
                    {c.instance_url}
                    {c.auth_failed_at && (
                        <span className="ml-2 text-amber-600 text-xs">
                            (requires auth — add account above)
                        </span>
                    )}
                </p>
            ),
            addForm: (
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
                                    <InputError message={errors.instance_url} />
                                </div>
                                <Button type="submit" disabled={processing}>
                                    Add timeline
                                </Button>
                            </>
                        )}
                    </Form>
                </div>
            ),
        },
    };

    const blueskyConfig: ProviderSectionConfig<BlueskyConnection> = {
        icon: <SiBluesky className="size-4" />,
        label: 'Bluesky',
        primary: {
            heading: 'Connected accounts',
            connections: blueskyHome,
            ReauthForm: BlueskyReauthForm,
            showFeedSettings: true,
            renderLabel: (c) => <strong>{c.handle}</strong>,
            addForm: (
                <div className="rounded-md border bg-muted/50 p-4">
                    <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        Add account
                    </p>
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
                                    <Label htmlFor="app_password">
                                        App Password
                                    </Label>
                                    <Input
                                        id="app_password"
                                        name="app_password"
                                        type="password"
                                        placeholder="xxxx-xxxx-xxxx-xxxx"
                                    />
                                    <InputError message={errors.app_password} />
                                    <p className="text-muted-foreground text-xs">
                                        Generate one at Settings &rarr; Privacy
                                        and Security &rarr; App Passwords in
                                        Bluesky.
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
            ),
        },
        secondary: {
            heading: 'Algorithmic feeds',
            connections: blueskyFeedConnections,
            renderLabel: (c) => (
                <div className="flex items-center gap-2">
                    <Avatar className="size-6 shrink-0">
                        <AvatarImage src={c.feed_avatar ?? undefined} alt="" />
                        <AvatarFallback>
                            <SiBluesky className="size-3" />
                        </AvatarFallback>
                    </Avatar>
                    {c.feed_name && (
                        <p className="truncate text-sm">
                            {c.feed_name}
                            {c.feed_creator_handle && (
                                <span className="text-muted-foreground">
                                    {' '}
                                    — by @{c.feed_creator_handle}
                                </span>
                            )}
                        </p>
                    )}
                </div>
            ),
            addForm: hasBlueskyHomeAccount && (
                <div className="rounded-md border bg-muted/50 p-4">
                    <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        Add algorithmic feed
                    </p>
                    <p className="mb-3 text-muted-foreground text-xs">
                        Browse or search Bluesky's curated feeds.
                    </p>
                    <Button asChild>
                        <Link href={blueskyFeeds.browse()}>Browse feeds</Link>
                    </Button>
                </div>
            ),
        },
    };

    const statusMessage = status ? STATUS_MESSAGES[status] : undefined;

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

                {statusMessage && (
                    <div
                        className={`font-medium text-sm ${statusMessage.tone === 'success' ? 'text-green-600' : 'text-amber-600'}`}
                    >
                        {statusMessage.text}
                    </div>
                )}

                <ProviderSection config={mastodonConfig} />
                <ProviderSection config={blueskyConfig} />
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
