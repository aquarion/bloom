import {
    Image,
    List,
    MessageSquareQuote,
    Reply,
    Terminal,
    X,
} from 'lucide-react';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { SiBluesky, SiMastodon } from 'react-icons/si';
import { CwTag } from '@/components/feed/CwTag';
import type { Post } from '@/types/post';

const SOURCE_ICONS = {
    mastodon: SiMastodon,
    bluesky: SiBluesky,
} as const;

function timeSince(dateStr: string): string {
    const seconds = Math.floor(
        (Date.now() - new Date(dateStr).getTime()) / 1000,
    );

    if (seconds < 60) {
        return 'just now';
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h ago`;
    }

    return `${Math.floor(hours / 24)}d ago`;
}

function PostRow({
    post,
    isCurrent,
    debugEnabled,
    onSelect,
}: {
    post: Post;
    isCurrent: boolean;
    debugEnabled: boolean;
    onSelect: () => void;
}) {
    const SourceIcon = SOURCE_ICONS[post.source];

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect();
        }
    };

    return (
        <div
            role={isCurrent ? undefined : 'button'}
            tabIndex={isCurrent ? undefined : 0}
            onClick={isCurrent ? undefined : onSelect}
            onKeyDown={isCurrent ? undefined : handleKeyDown}
            aria-label={
                isCurrent ? undefined : `Jump to post by ${post.author_name}`
            }
            className={`flex gap-2 border-white/10 border-b p-3 ${
                isCurrent
                    ? 'border-l-2 border-l-white bg-white/5'
                    : 'cursor-pointer hover:bg-white/5'
            }`}
        >
            <img
                src={post.author_avatar}
                alt={post.author_name}
                className="mt-0.5 h-8 w-8 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-white text-xs">
                        {post.author_name}
                    </span>
                    <SourceIcon className="size-3 shrink-0 text-white/40" />
                    {isCurrent && (
                        <span className="ml-auto shrink-0 rounded bg-white/20 px-1 py-0.5 font-bold text-[10px] text-white">
                            NOW
                        </span>
                    )}
                </div>
                <div className="text-[10px] text-white/40">
                    {post.author_handle} · {timeSince(post.created_at)}
                </div>
                {post.cw_text !== null && (
                    <div className="mt-1">
                        <CwTag label={post.cw_text} />
                    </div>
                )}
                {post.body && (
                    <p className="mt-1 line-clamp-2 text-white/70 text-xs">
                        {post.body}
                    </p>
                )}
                {post.hashtags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                        {post.hashtags.map(({ tag }) => (
                            <span
                                key={tag}
                                className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/50"
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}
                <div className="mt-1.5 flex items-center gap-2 text-white/30">
                    {post.media.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px]">
                            <Image className="size-3" />
                            {post.media.length}
                        </span>
                    )}
                    {post.quoted_post && (
                        <MessageSquareQuote
                            className="size-3"
                            aria-label="Quote"
                        />
                    )}
                    {post.reply_to && (
                        <Reply className="size-3" aria-label="Reply" />
                    )}
                    {debugEnabled && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                console.log(post);
                            }}
                            className="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-white/30 hover:bg-white/10 hover:text-white/60"
                            aria-label="Dump post to console"
                            title="Log to console"
                        >
                            <Terminal className="size-3" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function QueuePanel({
    current,
    queue,
    debugEnabled,
    onSelectPost,
}: {
    current: Post | null;
    queue: Post[];
    debugEnabled: boolean;
    onSelectPost: (postId: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const allPosts = current ? [current, ...queue] : queue;

    const selectPost = (postId: string) => {
        onSelectPost(postId);
        setOpen(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                aria-label="Show upcoming posts"
                title="Up next"
            >
                <List className="h-4 w-4" />
            </button>

            {open && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-30"
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Panel — slides in from the right so it never overlaps the
                        left-anchored settings sidebar (FeedSidebarPanel). */}
                    <div className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col bg-black/85 backdrop-blur-sm">
                        <div className="flex items-center justify-between border-white/10 border-b px-3 py-2">
                            <span className="font-bold text-white text-xs">
                                Up next · {allPosts.length} posts
                            </span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="flex h-6 w-6 items-center justify-center rounded text-white/40 hover:text-white"
                                aria-label="Close post queue"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {allPosts.map((post) => (
                                <PostRow
                                    key={post.id}
                                    post={post}
                                    isCurrent={post.id === current?.id}
                                    debugEnabled={debugEnabled}
                                    onSelect={() => selectPost(post.id)}
                                />
                            ))}
                            {allPosts.length === 0 && (
                                <p className="p-4 text-white/30 text-xs">
                                    No posts in queue.
                                </p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
