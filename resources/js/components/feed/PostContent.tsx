import { useLayoutEffect, useRef, useState } from 'react';
import { useCwState } from '@/hooks/useCwState';
import { shouldShowCwOverlay } from '@/lib/cw';
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
    labelSource: 'self' | 'external';
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
                        Revealing will always show this author from now on
                    </p>
                </>
            ) : (
                <p className="mb-4 max-w-sm text-base">
                    {labelSource === 'self'
                        ? `The author marked this post as ${cwText.toLowerCase()}`
                        : `This post has been labelled as ${cwText.toLowerCase()}`}
                </p>
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
}: {
    post: Post;
    onReady?: () => void;
    onAdvance?: () => void;
    onProgress?: (index: number, elapsed: number) => void;
    cwBehavior?: ContentBehavior;
    sensitiveMediaBehavior?: ContentBehavior;
    paused?: boolean;
}) {
    const colors = postDisplayColors(post);
    const [mediaRevealed, setMediaRevealed] = useState(false);
    const { isRevealed, reveal } = useCwState();

    const cwText = post.cw_text;
    const isAuthorLevel = post.cw_is_author_level;
    const showCwOverlay = shouldShowCwOverlay(
        post,
        cwBehavior,
        sensitiveMediaBehavior,
        isRevealed,
    );

    const onReadyRef = useRef(onReady);
    const blurMedia =
        post.sensitive_media &&
        sensitiveMediaBehavior === 'blur' &&
        !mediaRevealed;

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
    });

    const handleReady = () => {
        onReadyRef.current?.();
    };

    const revealCw = () => {
        reveal(post);
    };

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
                    paused={paused}
                    cwBehavior={cwBehavior}
                />
            </div>
            {showCwOverlay && cwText !== null && (
                <CwOverlay
                    cwText={cwText}
                    onReveal={revealCw}
                    isAuthorLevel={isAuthorLevel}
                    labelSource={post.cw_label_source ?? 'self'}
                    authorName={post.author_name}
                    authorHandle={post.author_handle}
                    authorAvatar={post.author_avatar}
                    authorEmojis={post.emojis}
                />
            )}
        </div>
    );
}
