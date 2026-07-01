import { useState } from 'react';
import { postDisplayColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';
import { PostAnimator } from './PostAnimator';

function CwOverlay({
    cwText,
    onReveal,
}: {
    cwText: string;
    onReveal: () => void;
}) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 px-8 text-center text-white">
            <p className="mb-4 max-w-sm text-base">{cwText}</p>
            <button
                type="button"
                onClick={onReveal}
                className="rounded-full bg-white/20 px-4 py-1.5 text-sm hover:bg-white/30"
            >
                Show anyway
            </button>
        </div>
    );
}

export function PostContent({
    post,
    onReady,
    onAdvance,
    cwBehavior = 'show',
    sensitiveMediaBehavior = 'show',
    paused = false,
}: {
    post: Post;
    onReady?: () => void;
    onAdvance?: () => void;
    cwBehavior?: ContentBehavior;
    sensitiveMediaBehavior?: ContentBehavior;
    paused?: boolean;
}) {
    const colors = postDisplayColors(post);
    const [cwRevealed, setCwRevealed] = useState(false);
    const [mediaRevealed, setMediaRevealed] = useState(false);

    const cwText = post.cw_text;
    const showCwOverlay =
        cwText !== null && cwBehavior === 'blur' && !cwRevealed;
    const blurMedia =
        post.sensitive_media &&
        sensitiveMediaBehavior === 'blur' &&
        !mediaRevealed;

    return (
        <div className="relative flex h-full w-full items-center justify-center">
            <PostAnimator
                post={post}
                colors={colors}
                onReady={onReady}
                onAdvance={onAdvance}
                blurMedia={blurMedia}
                onRevealMedia={() => setMediaRevealed(true)}
                paused={paused}
            />
            {showCwOverlay && cwText !== null && (
                <CwOverlay
                    cwText={cwText}
                    onReveal={() => setCwRevealed(true)}
                />
            )}
        </div>
    );
}
