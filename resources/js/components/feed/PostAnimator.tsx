import { useLayoutEffect, useRef } from 'react';
import type { PostColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';
import { MediaPost } from './MediaPost';
import { PanelsOnlyPost } from './PanelsOnlyPost';
import { TextPost } from './TextPost';

export function PostAnimator({
    post,
    colors,
    onReady,
    onAdvance,
    onProgress,
    blurMedia = false,
    onRevealMedia,
    paused = false,
    cwBehavior = 'show',
}: {
    post: Post;
    colors: PostColors | null;
    onReady?: () => void;
    onAdvance?: () => void;
    onProgress?: (index: number, elapsed: number) => void;
    blurMedia?: boolean;
    onRevealMedia?: () => void;
    paused?: boolean;
    cwBehavior?: ContentBehavior;
}) {
    const onReadyRef = useRef(onReady);

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
    });

    const body = (post.body || post.media[0]?.alt_text || '')
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
        .join('\n');

    const hasPanels = Boolean(
        post.link_url || post.quoted_post || post.reply_to || post.poll,
    );

    // Fire onReady immediately only when there is no body AND no panels to animate,
    // and not an image post (which fires onReady via ImageCarousel's onComplete).
    useLayoutEffect(() => {
        if (!body && !hasPanels && post.media.length === 0) {
            onReadyRef.current?.();
        }
    }, [body, hasPanels, post.media.length]);

    if (post.media.length > 0) {
        return (
            <MediaPost
                post={post}
                paused={paused}
                blurMedia={blurMedia}
                onRevealMedia={onRevealMedia}
                onProgress={onProgress}
                onAdvance={onAdvance}
                onReady={onReady}
                cwBehavior={cwBehavior}
            />
        );
    }

    if (!body) {
        if (hasPanels) {
            return (
                <PanelsOnlyPost
                    post={post}
                    onReady={onReady}
                    cwBehavior={cwBehavior}
                />
            );
        }

        return null;
    }

    return (
        <TextPost
            post={post}
            body={body}
            colors={colors}
            onReady={onReady}
            cwBehavior={cwBehavior}
        />
    );
}
