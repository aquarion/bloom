import type { ContentBehavior } from '@/types/preferences';

export interface CwLike {
    id: string;
    author_handle: string;
    cw_text: string | null;
    cw_is_author_level: boolean;
    sensitive_media: boolean;
    /** Absent for nested reply/quote posts (ReplyTo/QuotedPost), which have no separately-blurred media to except. */
    source?: 'mastodon' | 'bluesky';
}

interface NestedCwSource {
    original_url: string;
    author_handle: string;
    cw_text: string | null;
    cw_is_author_level: boolean;
    sensitive_media: boolean;
}

/**
 * ReplyTo/QuotedPost have no id of their own. original_url is normally unique per
 * post, but PostNormalizer's safeUrl() can collapse an unsafe/malformed source URL
 * to '' — falling back to author_handle + cw_text keeps reveal state from being
 * shared between two unrelated nested posts that both hit that edge case.
 */
export function nestedCwLike(nested: NestedCwSource): CwLike {
    return {
        id:
            nested.original_url ||
            `${nested.author_handle}:${nested.cw_text ?? ''}`,
        author_handle: nested.author_handle,
        cw_text: nested.cw_text,
        cw_is_author_level: nested.cw_is_author_level,
        sensitive_media: nested.sensitive_media,
    };
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

/**
 * Whether AuthorChip's persistent CW marker may show the raw label text. Attribution
 * renders in FeedChrome's always-visible chrome layer, entirely separate from
 * PostContent's blurred content layer — so unlike shouldShowCwOverlay, this must
 * stay hidden until reveal whenever cwBehavior is 'blur', or the label leaks the
 * warning (and for Mastodon, the author's own spoiler_text) before the gate is passed.
 */
export function isCwLabelVisible(
    post: CwLike,
    cwBehavior: ContentBehavior,
    isRevealed: (post: CwLike) => boolean,
): boolean {
    return post.cw_text !== null && (cwBehavior !== 'blur' || isRevealed(post));
}
