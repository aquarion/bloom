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
                                author_name={post.reply_to.author_name}
                                author_avatar={post.reply_to.author_avatar}
                                author_handle={post.reply_to.author_handle}
                                emojis={post.emojis}
                                body={post.reply_to.body}
                                original_url={post.reply_to.original_url}
                                chip_mentions={post.reply_to.chip_mentions}
                                cw_text={post.reply_to.cw_text}
                                cw_is_author_level={
                                    post.reply_to.cw_is_author_level
                                }
                                cw_label_source={post.reply_to.cw_label_source}
                                sensitive_media={
                                    post.reply_to.sensitive_media
                                }
                                cwBehavior={cwBehavior}
                                fullWidth
                            />
                        )}
                        {post.quoted_post && (
                            <ContextPanel
                                icon={<Quote className="size-3.5" />}
                                author_name={post.quoted_post.author_name}
                                author_avatar={post.quoted_post.author_avatar}
                                author_handle={post.quoted_post.author_handle}
                                emojis={post.emojis}
                                body={post.quoted_post.body}
                                original_url={post.quoted_post.original_url}
                                chip_mentions={post.quoted_post.chip_mentions}
                                cw_text={post.quoted_post.cw_text}
                                cw_is_author_level={
                                    post.quoted_post.cw_is_author_level
                                }
                                cw_label_source={
                                    post.quoted_post.cw_label_source
                                }
                                sensitive_media={
                                    post.quoted_post.sensitive_media
                                }
                                cwBehavior={cwBehavior}
                                fullWidth
                            />
                        )}
                        {post.link_url && (
                            <LinkCard
                                url={post.link_url}
                                title={post.link_title}
                                fullWidth
                                favicon={post.link_favicon}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
