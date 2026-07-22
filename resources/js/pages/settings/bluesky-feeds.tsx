import { Form, Head } from '@inertiajs/react';
import axios from 'axios';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import { edit } from '@/routes/connections';
import blueskyFeed from '@/routes/connections/bluesky-feed';
import blueskyFeeds from '@/routes/connections/bluesky-feeds';
import type { FeedGeneratorSummary } from '@/types/feed-generator';

const STATUS_MESSAGES: Record<
    string,
    { tone: 'success' | 'warning'; text: string }
> = {
    'bluesky-feed-added': {
        tone: 'success',
        text: 'Bluesky algorithmic feed added.',
    },
    'bluesky-feed-already-added': {
        tone: 'warning',
        text: 'That Bluesky feed is already added.',
    },
};

function FeedGeneratorRow({ feed }: { feed: FeedGeneratorSummary }) {
    return (
        <li className="flex items-center gap-3 rounded-md border px-3 py-2">
            <Avatar className="size-9">
                <AvatarImage src={feed.avatar} alt="" />
                <AvatarFallback>
                    {feed.display_name.charAt(0) || '?'}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">
                    {feed.display_name}
                </p>
                <p className="truncate text-muted-foreground text-xs">
                    {feed.creator_handle && <>by @{feed.creator_handle}</>}
                    {feed.description && <> — {feed.description}</>}
                </p>
            </div>
            <Form {...blueskyFeed.store.form()}>
                {({ processing }) => (
                    <>
                        <input type="hidden" name="feed_url" value={feed.uri} />
                        <Button type="submit" size="sm" disabled={processing}>
                            Add
                        </Button>
                    </>
                )}
            </Form>
        </li>
    );
}

export default function BlueskyFeeds({
    popularFeeds,
    status,
}: {
    popularFeeds: FeedGeneratorSummary[];
    status?: string;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<FeedGeneratorSummary[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [manualOpen, setManualOpen] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (query.trim().length < 2) {
            return;
        }

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        const controller = new AbortController();

        debounceRef.current = setTimeout(() => {
            setLoading(true);
            axios
                .get<{ feeds: FeedGeneratorSummary[] }>(
                    blueskyFeeds.search.url({ query: { q: query } }),
                    { signal: controller.signal },
                )
                .then((res) => setResults(res.data.feeds))
                .catch((err) => {
                    if (!axios.isCancel(err)) {
                        setResults([]);
                    }
                })
                .finally(() => setLoading(false));
        }, 300);

        return () => {
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            controller.abort();
        };
    }, [query]);

    const listedFeeds = results ?? popularFeeds;
    const listHeading = results !== null ? 'Search results' : 'Popular feeds';
    const statusMessage = status ? STATUS_MESSAGES[status] : undefined;

    return (
        <SettingsPageLayout>
            <Head title="Add algorithmic feed" />

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Add algorithmic feed"
                    description="Browse or search Bluesky's curated feeds."
                />

                {statusMessage && (
                    <div
                        className={`font-medium text-sm ${statusMessage.tone === 'success' ? 'text-green-600' : 'text-amber-600'}`}
                    >
                        {statusMessage.text}
                    </div>
                )}

                <div className="space-y-1">
                    <Label htmlFor="feed_search">Search feeds</Label>
                    <div className="relative">
                        <Input
                            id="feed_search"
                            placeholder="News, art, cats..."
                            autoComplete="off"
                            value={query}
                            onChange={(e) => {
                                const value = e.target.value;

                                setQuery(value);

                                if (value.trim().length < 2) {
                                    setResults(null);
                                    setLoading(false);
                                }
                            }}
                        />
                        {loading && (
                            <Loader2 className="absolute top-2.5 right-2.5 size-4 animate-spin text-muted-foreground" />
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                        {listHeading}
                    </p>
                    {listedFeeds.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            No feeds found.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {listedFeeds.map((feed) => (
                                <FeedGeneratorRow key={feed.uri} feed={feed} />
                            ))}
                        </ul>
                    )}
                </div>

                <div className="rounded-md border bg-muted/50 p-4">
                    <button
                        type="button"
                        onClick={() => setManualOpen((o) => !o)}
                        className="flex items-center gap-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide hover:text-foreground"
                    >
                        {manualOpen ? (
                            <ChevronUp className="h-3 w-3" />
                        ) : (
                            <ChevronDown className="h-3 w-3" />
                        )}
                        Paste a feed URL instead
                    </button>
                    {manualOpen && (
                        <Form
                            {...blueskyFeed.store.form()}
                            className="mt-3 space-y-3"
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
                                            placeholder="https://bsky.app/profile/.../feed/..."
                                        />
                                        <InputError message={errors.feed_url} />
                                    </div>
                                    <Button type="submit" disabled={processing}>
                                        Add feed
                                    </Button>
                                </>
                            )}
                        </Form>
                    )}
                </div>

                <TextLink href={edit()}>Back to connected accounts</TextLink>
            </div>
        </SettingsPageLayout>
    );
}

BlueskyFeeds.layout = {
    breadcrumbs: [
        {
            title: 'Add algorithmic feed',
            href: '/settings/connections/bluesky-feeds',
        },
    ],
};
