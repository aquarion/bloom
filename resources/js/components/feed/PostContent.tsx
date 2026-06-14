import { useState } from 'react';
import { postDisplayColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';
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
    cwBehavior = 'show',
    sensitiveMediaBehavior = 'show',
}: {
    post: Post;
    onReady?: () => void;
    cwBehavior?: 'skip' | 'blur' | 'show';
    sensitiveMediaBehavior?: 'skip' | 'blur' | 'show';
}) {
    const colors = postDisplayColors(post);
    const [cwRevealed, setCwRevealed] = useState(false);
    const [mediaRevealed, setMediaRevealed] = useState(false);

    const showCwOverlay =
        post.cw_text !== null && cwBehavior === 'blur' && !cwRevealed;
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
                blurMedia={blurMedia}
                onRevealMedia={() => setMediaRevealed(true)}
            />
            {showCwOverlay && (
                <CwOverlay
                    cwText={post.cw_text!}
                    onReveal={() => setCwRevealed(true)}
                />
            )}
        </div>
    );
}
