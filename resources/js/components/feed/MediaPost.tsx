import { Quote, Reply } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';
import { ContextPanel } from './ContextPanel';
import { EmojiText } from '@/lib/emoji-text';
import { ImageCarousel } from './ImageCarousel';
import { LinkCard } from './LinkCard';
import { PollResults } from './PollResults';

export function MediaPost({
    post,
    paused = false,
    blurMedia = false,
    onRevealMedia,
    onProgress,
    onAdvance,
    onReady,
    cwBehavior = 'show',
}: {
    post: Post;
    paused?: boolean;
    blurMedia?: boolean;
    onRevealMedia?: () => void;
    onProgress?: (index: number, elapsed: number) => void;
    onAdvance?: () => void;
    onReady?: () => void;
    cwBehavior?: ContentBehavior;
}) {
    const onReadyRef = useRef(onReady);
    const onAdvanceRef = useRef(onAdvance);

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
        onAdvanceRef.current = onAdvance;
    });

    return (
        <div className="flex h-full w-full items-center justify-center p-6">
            <div className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/50 backdrop-blur-sm">
                <ImageCarousel
                    media={post.media}
                    duration={8000}
                    paused={paused}
                    blurMedia={blurMedia}
                    onRevealMedia={onRevealMedia ?? (() => {})}
                    onComplete={() =>
                        (onAdvanceRef.current ?? onReadyRef.current)?.()
                    }
                    onProgress={onProgress}
                />
                {post.body && (
                    <div className="shrink-0 border-white/10 border-t px-4 py-3 text-sm text-white/80 leading-snug">
                        <EmojiText text={post.body} emojis={post.emojis} />
                    </div>
                )}
                {post.poll && (
                    <div className="shrink-0 border-white/10 border-t px-4 py-3">
                        <PollResults
                            poll={post.poll}
                            originalUrl={post.original_url}
                        />
                    </div>
                )}
                {(post.reply_to || post.quoted_post || post.link_url) && (
                    <div className="flex shrink-0 flex-col gap-2 border-white/10 border-t px-4 py-3">
                        {post.reply_to && (
                            <ContextPanel
                                icon={<Reply className="size-3.5" />}
                                emojis={post.emojis}
                                cwBehavior={cwBehavior}
                                fullWidth
                                {...post.reply_to}
                            />
                        )}
                        {post.quoted_post && (
                            <ContextPanel
                                icon={<Quote className="size-3.5" />}
                                emojis={post.emojis}
                                cwBehavior={cwBehavior}
                                fullWidth
                                {...post.quoted_post}
                            />
                        )}
                        {post.link_url && (
                            <LinkCard
                                url={post.link_url}
                                title={post.link_title}
                                fullWidth
                                favicon={post.link_favicon}
                                youtubeId={post.link_youtube_id}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
