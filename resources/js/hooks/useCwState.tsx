import { createContext, use, useState } from 'react';
import type { ReactNode } from 'react';
import FeedSettingsController from '@/actions/App/Http/Controllers/Settings/FeedSettingsController';
import { getXsrfToken } from '@/lib/csrf';
import type { CwLike } from '@/lib/cw';

interface CwContextValue {
    isRevealed: (post: CwLike) => boolean;
    reveal: (post: CwLike) => void;
}

const CwContext = createContext<CwContextValue | null>(null);

/**
 * Best-effort background persist — the reveal already applies locally for this
 * session regardless of whether this succeeds, so failures are swallowed rather
 * than surfaced (there's no useful recovery action from inside a reveal click).
 */
function persistAuthorWhitelist(authorHandle: string) {
    try {
        fetch(FeedSettingsController.whitelistAuthor.url(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-XSRF-TOKEN': getXsrfToken(),
            },
            body: JSON.stringify({ author_handle: authorHandle }),
        }).catch(() => {});
    } catch {
        // getXsrfToken() throws when the session cookie is missing.
    }
}

export function CwStateProvider({
    children,
    initialAuthorWhitelist = [],
}: {
    children: ReactNode;
    /** Authors previously whitelisted via an author-level CW reveal (#229) — persists across sessions. */
    initialAuthorWhitelist?: string[];
}) {
    const [revealedPostIds, setRevealedPostIds] = useState(
        () => new Set<string>(),
    );
    const [revealedAuthors, setRevealedAuthors] = useState(
        () => new Set<string>(initialAuthorWhitelist),
    );

    const isRevealed = (post: CwLike) =>
        revealedPostIds.has(post.id) || revealedAuthors.has(post.author_handle);

    const reveal = (post: CwLike) => {
        setRevealedPostIds((prev) => new Set(prev).add(post.id));

        // Only an author-level CW (the author's profile itself is labelled) unhides
        // future posts from them — a post-level accept must stay scoped to that one
        // post, or an unrelated later CW from the same author would be silently skipped.
        if (post.cw_is_author_level) {
            setRevealedAuthors((prev) => {
                // Check against prev, not the closed-over revealedAuthors, so two
                // reveal() calls batched into the same update (e.g. a rapid double
                // click) can't both see "not yet revealed" and double-POST.
                if (!prev.has(post.author_handle)) {
                    persistAuthorWhitelist(post.author_handle);
                }

                return new Set(prev).add(post.author_handle);
            });
        }
    };

    return <CwContext value={{ isRevealed, reveal }}>{children}</CwContext>;
}

export function useCwState() {
    const context = use(CwContext);

    if (!context) {
        throw new Error('useCwState must be used within a CwStateProvider.');
    }

    return context;
}
