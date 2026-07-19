import { createContext, use, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ContentBehavior } from '@/types/preferences';

interface CwLike {
    id: string;
    author_handle: string;
    cw_text: string | null;
    cw_is_author_level: boolean;
    sensitive_media: boolean;
    /** Absent for nested reply/quote posts (ReplyTo/QuotedPost), which have no separately-blurred media to except. */
    source?: 'mastodon' | 'bluesky';
}

interface CwContextValue {
    isRevealed: (post: CwLike) => boolean;
    reveal: (post: CwLike) => void;
}

const CwContext = createContext<CwContextValue | null>(null);

export function CwStateProvider({ children }: { children: ReactNode }) {
    const [revealedPostIds, setRevealedPostIds] = useState(
        () => new Set<string>(),
    );
    const [revealedAuthors, setRevealedAuthors] = useState(
        () => new Set<string>(),
    );

    const isRevealed = useCallback(
        (post: CwLike) =>
            revealedPostIds.has(post.id) ||
            revealedAuthors.has(post.author_handle),
        [revealedPostIds, revealedAuthors],
    );

    const reveal = useCallback((post: CwLike) => {
        setRevealedPostIds((prev) => new Set(prev).add(post.id));

        // Only an author-level CW (the author's profile itself is labelled) unhides
        // future posts from them — a post-level accept must stay scoped to that one
        // post, or an unrelated later CW from the same author would be silently skipped.
        if (post.cw_is_author_level) {
            setRevealedAuthors((prev) => new Set(prev).add(post.author_handle));
        }
    }, []);

    const value = useMemo(
        () => ({ isRevealed, reveal }),
        [isRevealed, reveal],
    );

    return <CwContext value={value}>{children}</CwContext>;
}

export function useCwState() {
    const context = use(CwContext);

    if (!context) {
        throw new Error('useCwState must be used within a CwStateProvider.');
    }

    return context;
}

/** Shared by PostContent (to render the overlay) and feed.tsx (to pause auto-advance while it's showing). */
export function shouldShowCwOverlay(
    post: CwLike,
    cwBehavior: ContentBehavior,
    sensitiveMediaBehavior: ContentBehavior,
    isRevealed: (post: CwLike) => boolean,
): boolean {
    return (
        post.cw_text !== null &&
        cwBehavior === 'blur' &&
        !isRevealed(post) &&
        // When the media is already individually blurred (Bluesky label-based CW),
        // the full-post overlay is redundant — post text is readable and gives enough
        // context to decide whether to reveal. Mastodon spoiler_text is user-authored
        // so it always deserves its own overlay.
        !(
            post.source === 'bluesky' &&
            post.sensitive_media &&
            sensitiveMediaBehavior === 'blur'
        )
    );
}
