import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Quote, Reply } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { Post } from '@/types/post';
import { ContextPanel } from './ContextPanel';
import { LinkCard } from './LinkCard';
import { PollResults } from './PollResults';

export function PanelsOnlyPost({
    post,
    onReady,
}: {
    post: Post;
    onReady?: () => void;
}) {
    const panelsRef = useRef<HTMLDivElement>(null);
    const onReadyRef = useRef(onReady);

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
    });

    // Fade panels in — this component only mounts for no-body, no-media
    // posts that have panels, so no further guarding is needed here.
    useGSAP(() => {
        if (!panelsRef.current) {
            onReadyRef.current?.();

            return;
        }

        const tween = gsap.fromTo(
            panelsRef.current,
            { opacity: 0, y: -8 },
            {
                opacity: 1,
                y: 0,
                duration: 0.4,
                ease: 'power2.out',
                onComplete: () => onReadyRef.current?.(),
            },
        );

        return () => tween.kill();
    }, [post.id]);

    return (
        <div className="flex h-full w-full items-center justify-center p-8">
            <div ref={panelsRef} className="flex flex-col items-center gap-4">
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
                    />
                )}
                {post.poll && (
                    <PollResults
                        poll={post.poll}
                        originalUrl={post.original_url}
                    />
                )}
                {post.link_url && (
                    <LinkCard
                        url={post.link_url}
                        title={post.link_title}
                        favicon={post.link_favicon}
                    />
                )}
            </div>
        </div>
    );
}
