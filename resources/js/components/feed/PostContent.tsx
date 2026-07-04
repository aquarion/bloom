import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { postDisplayColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';
import { AuthorChip } from './AuthorChip';
import { PostAnimator } from './PostAnimator';

function CwOverlay({
    cwText,
    onReveal,
    isAuthorLevel,
    labelSource,
    authorName,
    authorHandle,
    authorAvatar,
    authorEmojis,
}: {
    cwText: string;
    onReveal: () => void;
    isAuthorLevel: boolean;
    labelSource: 'self' | 'external' | null;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    authorEmojis: Record<string, string>;
}) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 px-8 text-center text-white">
            {isAuthorLevel ? (
                <>
                    <p className="mb-3 max-w-sm text-base">This author</p>
                    <div className="mb-3 w-full max-w-xs">
                        <AuthorChip
                            name={authorName}
                            account={authorHandle}
                            avatar={authorAvatar}
                            emojis={authorEmojis}
                        />
                    </div>
                    <p className="mb-1 max-w-sm text-base">
                        {labelSource === 'self'
                            ? `marks their posts as ${cwText.toLowerCase()}`
                            : `has been labelled as posting ${cwText.toLowerCase()}`}
                    </p>
                    <p className="mb-4 max-w-sm text-sm text-white/60">
                        Revealing will unhide all their posts for this session
                    </p>
                </>
            ) : (
                <p className="mb-4 max-w-sm text-base">{cwText}</p>
            )}
            <button
                type="button"
                onClick={onReveal}
                className="rounded-full bg-white/20 px-4 py-1.5 text-sm hover:bg-white/30"
            >
                {isAuthorLevel ? 'Show author' : 'Show anyway'}
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
    onCwOverlayActive,
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
    onCwOverlayActive?: (active: boolean) => void;
}) {
    const colors = postDisplayColors(post);
    const [cwRevealed, setCwRevealed] = useState(false);
    const [mediaRevealed, setMediaRevealed] = useState(false);

    const cwText = post.cw_text;
    const isAuthorLevel = post.cw_is_author_level;
    const showCwOverlay =
        cwText !== null &&
        cwBehavior === 'blur' &&
        !cwRevealed &&
        !authorCwRevealed &&
        // When the media is already individually blurred (Bluesky label-based CW),
        // the full-post overlay is redundant — post text is readable and gives enough
        // context to decide whether to reveal. Mastodon spoiler_text is user-authored
        // so it always deserves its own overlay.
        !(
            post.source === 'bluesky' &&
            post.sensitive_media &&
            sensitiveMediaBehavior === 'blur'
        );

    // Tracks whether PostAnimator fired onReady while the CW overlay was blocking it,
    // so we can forward it immediately when the user dismisses the overlay.
    const pendingReadyRef = useRef(false);
    const onReadyRef = useRef(onReady);
    // Initialized from the computed showCwOverlay so it's correct before the
    // first useLayoutEffect sync — PostAnimator's layout effects (children) run
    // before ours (parent), so handleReady can fire before our sync otherwise.
    // Author-level overlays don't suppress onReady — auto-advance continues.
    const showCwOverlayRef = useRef(showCwOverlay && !isAuthorLevel);
    const revealInProgressRef = useRef(false);
    const blurMedia =
        post.sensitive_media &&
        sensitiveMediaBehavior === 'blur' &&
        !mediaRevealed;

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
        showCwOverlayRef.current = showCwOverlay && !isAuthorLevel;
    });

    const onCwOverlayActiveRef = useRef(onCwOverlayActive);
    useLayoutEffect(() => {
        onCwOverlayActiveRef.current = onCwOverlayActive;
    });

    useLayoutEffect(() => {
        if (!isAuthorLevel) {
            onCwOverlayActiveRef.current?.(showCwOverlay);
        }
    }, [showCwOverlay, isAuthorLevel]);

    // Suppress readiness signals while a post-level CW overlay is up — otherwise
    // the auto-advance timer would start and scroll past unacknowledged content.
    // Author-level overlays don't block the timer; the feed advances on its own.
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
                    paused={paused || (showCwOverlay && !isAuthorLevel)}
                />
            </div>
            {showCwOverlay && cwText !== null && (
                <CwOverlay
                    cwText={cwText}
                    onReveal={revealCw}
                    isAuthorLevel={isAuthorLevel}
                    labelSource={post.cw_label_source}
                    authorName={post.author_name}
                    authorHandle={post.author_handle}
                    authorAvatar={post.author_avatar}
                    authorEmojis={post.emojis}
                />
            )}
        </div>
    );
}
