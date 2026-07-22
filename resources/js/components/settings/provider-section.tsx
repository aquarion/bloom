import { Form, useForm } from '@inertiajs/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import FeedSettingsController from '@/actions/App/Http/Controllers/Settings/FeedSettingsController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import bluesky from '@/routes/bluesky';
import { destroy as disconnectAccount } from '@/routes/connections';
import mastodon from '@/routes/mastodon';

interface BaseConnection {
    id: number;
    handle: string | null;
    auth_failed_at: string | null;
    feed_settings: {
        max_posts?: number;
        max_age_days?: number | null;
    } | null;
}

export interface MastodonConnection extends BaseConnection {
    provider: 'mastodon';
    feed_type: 'home' | 'public_mastodon';
    instance_url: string | null;
}

export interface BlueskyConnection
    extends Omit<BaseConnection, 'feed_settings'> {
    provider: 'bluesky';
    feed_type: 'home' | 'bluesky_feed';
    instance_url: null;
    feed_settings: {
        max_posts?: number;
        max_age_days?: number | null;
        feed_uri?: string;
        feed_name?: string;
    } | null;
}

export type SocialConnection = MastodonConnection | BlueskyConnection;

export interface ProviderSectionConfig<
    C extends SocialConnection = SocialConnection,
> {
    icon: ReactNode;
    label: string;
    primary?: {
        heading: string;
        connections: C[];
        ReauthForm: ComponentType<{ connection: C }>;
        renderLabel: (connection: C) => ReactNode;
        showFeedSettings?: boolean;
    };
    secondary?: {
        heading: string;
        connections: C[];
        renderLabel: (connection: C) => ReactNode;
    };
    addForms: ReactNode;
}

export function AccountFeedSettings({
    connection,
}: {
    connection: SocialConnection;
}) {
    const [open, setOpen] = useState(false);
    const { data, setData, put, processing } = useForm({
        max_posts: connection.feed_settings?.max_posts ?? 20,
        max_age_days: connection.feed_settings?.max_age_days ?? null,
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        put(
            FeedSettingsController.updateAccount.url({
                account: connection.id,
            }),
        );
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

export function BlueskyReauthForm({
    connection,
}: {
    connection: BlueskyConnection;
}) {
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

export function MastodonReauthForm({
    connection,
}: {
    connection: MastodonConnection;
}) {
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

export function DisconnectButton({
    connection,
}: {
    connection: SocialConnection;
}) {
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

export function ProviderSection<C extends SocialConnection>({
    config,
}: {
    config: ProviderSectionConfig<C>;
}) {
    const { primary, secondary } = config;

    return (
        <div className="rounded-lg border p-6">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
                {config.icon} {config.label}
            </h3>

            {primary && primary.connections.length > 0 && (
                <div className="mb-4">
                    <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        {primary.heading}
                    </p>
                    <ul className="space-y-2">
                        {primary.connections.map((c) => (
                            <li
                                key={c.id}
                                data-testid={`account-${c.id}`}
                                className="rounded-md border px-3 py-2"
                            >
                                {c.auth_failed_at ? (
                                    <primary.ReauthForm connection={c} />
                                ) : (
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-muted-foreground text-sm">
                                                {primary.renderLabel(c)}
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
                                                        disabled={processing}
                                                    >
                                                        Disconnect
                                                    </Button>
                                                )}
                                            </Form>
                                        </div>
                                        {primary.showFeedSettings && (
                                            <AccountFeedSettings
                                                connection={c}
                                            />
                                        )}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {secondary && secondary.connections.length > 0 && (
                <div className="mb-4">
                    <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        {secondary.heading}
                    </p>
                    <ul className="space-y-2">
                        {secondary.connections.map((c) => (
                            <li
                                key={c.id}
                                data-testid={`account-${c.id}`}
                                className="flex items-center justify-between rounded-md border px-3 py-2"
                            >
                                {secondary.renderLabel(c)}
                                <DisconnectButton connection={c} />
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="space-y-3">{config.addForms}</div>
        </div>
    );
}
