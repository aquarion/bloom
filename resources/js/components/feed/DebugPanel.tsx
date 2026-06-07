import {
    Image,
    List,
    MessageSquareQuote,
    Reply,
    Terminal,
    X,
} from 'lucide-react';
import { useState } from 'react';
import { SiBluesky, SiMastodon } from 'react-icons/si';
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

function PostRow({ post, isCurrent }: { post: Post; isCurrent: boolean }) {
    const SourceIcon = SOURCE_ICONS[post.source];

    return (
        <div
            className={`flex gap-2 border-white/10 border-b p-3 ${isCurrent ? 'border-l-2 border-l-amber-400 bg-white/5' : ''}`}
        >
            <img
                src={post.author_avatar}
                alt={post.author_name}
                className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-white text-xs">
                        {post.author_name}
                    </span>
                    <SourceIcon className="size-3 flex-shrink-0 text-white/40" />
                    {isCurrent && (
                        <span className="ml-auto flex-shrink-0 rounded bg-amber-400/20 px-1 py-0.5 font-bold text-[10px] text-amber-400">
                            NOW
                        </span>
                    )}
                </div>
                <div className="text-[10px] text-white/40">
                    {post.author_handle} · {timeSince(post.created_at)}
                </div>
                {post.body && (
                    <p className="mt-1 line-clamp-2 text-white/70 text-xs">
                        {post.body}
                    </p>
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
                    <button
                        type="button"
                        onClick={() => console.log(post)}
                        className="ml-auto flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-white/30 hover:bg-white/10 hover:text-white/60"
                        aria-label="Dump post to console"
                        title="Log to console"
                    >
                        <Terminal className="size-3" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export function DebugPanel({
    current,
    queue,
}: {
    current: Post | null;
    queue: Post[];
}) {
    const [open, setOpen] = useState(false);
    const allPosts = current ? [current, ...queue] : queue;

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                aria-label="Debug: show post queue"
                title="Debug panel"
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

                    {/* Panel */}
                    <div className="fixed inset-y-0 left-0 z-40 flex w-80 flex-col bg-black/85 backdrop-blur-sm">
                        <div className="flex items-center justify-between border-white/10 border-b px-3 py-2">
                            <span className="font-bold text-amber-400 text-xs">
                                Debug · {allPosts.length} posts
                            </span>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="flex h-6 w-6 items-center justify-center rounded text-white/40 hover:text-white"
                                aria-label="Close debug panel"
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
