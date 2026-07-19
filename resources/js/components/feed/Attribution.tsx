import { Quote, Repeat2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { absoluteTime, timeSince } from '@/lib/time-since';
import type { Post } from '@/types/post';
import { AuthorChip } from './AuthorChip';

export function Attribution({ post }: { post: Post }) {
    // eslint-disable-next-line @eslint-react/use-state
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 30_000);

        return () => clearInterval(id);
    }, []);

    if (post.quoted_post) {
        return (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                {post.quoted_post.original_url ? (
                    <a
                        href={post.quoted_post.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-2"
                    >
                        <AuthorChip
                            name={post.quoted_post.author_name}
                            avatar={post.quoted_post.author_avatar}
                            emojis={post.emojis}
                            account={post.quoted_post.author_handle}
                            time={
                                post.quoted_post.created_at
                                    ? timeSince(post.quoted_post.created_at)
                                    : undefined
                            }
                            absoluteTime={
                                post.quoted_post.created_at
                                    ? absoluteTime(post.quoted_post.created_at)
                                    : undefined
                            }
                            cwLabel={post.quoted_post.cw_text}
                        />
                    </a>
                ) : (
                    <div className="flex min-w-0 items-center gap-2">
                        <AuthorChip
                            name={post.quoted_post.author_name}
                            avatar={post.quoted_post.author_avatar}
                            emojis={post.emojis}
                            account={post.quoted_post.author_handle}
                            time={
                                post.quoted_post.created_at
                                    ? timeSince(post.quoted_post.created_at)
                                    : undefined
                            }
                            absoluteTime={
                                post.quoted_post.created_at
                                    ? absoluteTime(post.quoted_post.created_at)
                                    : undefined
                            }
                            cwLabel={post.quoted_post.cw_text}
                        />
                    </div>
                )}
                <Quote className="size-4 flex-shrink-0 text-white/30" />
                <a
                    href={post.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-2"
                >
                    <AuthorChip
                        name={post.author_name}
                        avatar={post.author_avatar}
                        emojis={post.emojis}
                        account={post.author_handle}
                        time={timeSince(post.created_at)}
                        absoluteTime={absoluteTime(post.created_at)}
                        cwLabel={post.cw_text}
                    />
                </a>
            </div>
        );
    }

    if (post.boosted_by) {
        const label = (
            <Repeat2
                className="size-4 flex-shrink-0"
                role="img"
                aria-label={post.source === 'mastodon' ? 'Boosted' : 'Reposted'}
            />
        );

        return (
            <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <a
                    href={post.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-2"
                >
                    <AuthorChip
                        name={post.author_name}
                        avatar={post.author_avatar}
                        emojis={post.emojis}
                        account={post.author_handle}
                        time={timeSince(post.created_at)}
                        absoluteTime={absoluteTime(post.created_at)}
                        cwLabel={post.cw_text}
                    />
                </a>
                <span className="flex-shrink-0 text-white/30">{label}</span>
                <div className="flex min-w-0 items-center gap-2">
                    <AuthorChip
                        name={post.boosted_by}
                        avatar={post.boosted_by_avatar ?? ''}
                        emojis={post.emojis}
                        account={post.boosted_by_handle ?? ''}
                        time={
                            post.boosted_by_created_at
                                ? timeSince(post.boosted_by_created_at)
                                : undefined
                        }
                        absoluteTime={
                            post.boosted_by_created_at
                                ? absoluteTime(post.boosted_by_created_at)
                                : undefined
                        }
                    />
                </div>
            </div>
        );
    }

    const chip = (
        <AuthorChip
            name={post.author_name}
            avatar={post.author_avatar}
            emojis={post.emojis}
            account={post.author_handle}
            time={timeSince(post.created_at)}
            absoluteTime={absoluteTime(post.created_at)}
            cwLabel={post.cw_text}
        />
    );

    if (post.original_url) {
        return (
            <a
                href={post.original_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-2 text-left"
            >
                {chip}
            </a>
        );
    }

    return (
        <div className="flex min-w-0 items-center gap-2 text-left">{chip}</div>
    );
}
