import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
    onProgress,
    cwBehavior = 'show',
    sensitiveMediaBehavior = 'show',
    paused = false,
    authorCwRevealed = false,
    onRevealAuthor,
}: {
    post: Post;
    onReady?: () => void;
    onAdvance?: () => void;
    onProgress?: (index: number, elapsed: number) => void;
    cwBehavior?: ContentBehavior;
    sensitiveMediaBehavior?: ContentBehavior;
    paused?: boolean;
    authorCwRevealed?: boolean;
    onRevealAuthor?: () => void;
}) {
    const colors = postDisplayColors(post);
    const [cwRevealed, setCwRevealed] = useState(false);
    const [mediaRevealed, setMediaRevealed] = useState(false);

    const cwText = post.cw_text;
    const showCwOverlay =
        cwText !== null &&
        cwBehavior === 'blur' &&
        !cwRevealed &&
        !authorCwRevealed;

    // Tracks whether PostAnimator fired onReady while the CW overlay was blocking it,
    // so we can forward it immediately when the user dismisses the overlay.
    const pendingReadyRef = useRef(false);
    const onReadyRef = useRef(onReady);
    // Initialized from the computed showCwOverlay so it's correct before the
    // first useLayoutEffect sync — PostAnimator's layout effects (children) run
    // before ours (parent), so handleReady can fire before our sync otherwise.
    const showCwOverlayRef = useRef(showCwOverlay);
    const revealInProgressRef = useRef(false);
    const blurMedia =
        post.sensitive_media &&
        sensitiveMediaBehavior === 'blur' &&
        !mediaRevealed;

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
        showCwOverlayRef.current = showCwOverlay;
    });

    // Suppress readiness signals while the CW overlay is up — otherwise the
    // auto-advance timer would start and scroll past unacknowledged CW content.
    const handleReady = useCallback(() => {
        if (showCwOverlayRef.current) {
            pendingReadyRef.current = true;
        } else {
            onReadyRef.current?.();
        }
    }, []);

    const onRevealAuthorRef = useRef(onRevealAuthor);
    useLayoutEffect(() => {
        onRevealAuthorRef.current = onRevealAuthor;
    });

    // Fires any onReady suppressed while the overlay was up,
    // and records this author as revealed for the rest of the session.
    const revealCw = useCallback(() => {
        if (revealInProgressRef.current) {
            return;
        }

        revealInProgressRef.current = true;

        setCwRevealed(true);
        onRevealAuthorRef.current?.();

        if (pendingReadyRef.current) {
            pendingReadyRef.current = false;
            onReadyRef.current?.();
        }
    }, []);

    return (
        <div className="relative flex h-full w-full items-center justify-center">
            <div className={`h-full w-full ${showCwOverlay ? 'blur-xl' : ''}`}>
                <PostAnimator
                    post={post}
                    colors={colors}
                    onReady={handleReady}
                    onAdvance={onAdvance}
                    onProgress={onProgress}
                    blurMedia={blurMedia}
                    onRevealMedia={() => setMediaRevealed(true)}
                    paused={paused || showCwOverlay}
                />
            </div>
            {showCwOverlay && cwText !== null && (
                <CwOverlay cwText={cwText} onReveal={revealCw} />
            )}
        </div>
    );
}
