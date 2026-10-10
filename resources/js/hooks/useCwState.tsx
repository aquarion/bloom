import type { ReactNode } from 'react';
import { createContext, use, useRef, useState } from 'react';
import FeedSettingsController from '@/actions/App/Http/Controllers/Settings/FeedSettingsController';
import { getXsrfToken } from '@/lib/csrf';
import type { CwLike } from '@/lib/cw';
import type { CwCategory } from '@/types/post';

interface CwContextValue {
    isRevealed: (post: CwLike) => boolean;
    reveal: (post: CwLike) => void;
    /** Reveals the post and persists its CW categories so future posts in them skip the overlay. */
    revealAlways: (post: CwLike) => void;
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

/** Best-effort background persist, same swallow-failures rationale as persistAuthorWhitelist. */
function persistCategoryWhitelist(categories: CwCategory[]) {
    try {
        fetch(FeedSettingsController.whitelistCwCategories.url(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-XSRF-TOKEN': getXsrfToken(),
            },
            body: JSON.stringify({ categories }),
        }).catch(() => {});
    } catch {
        // getXsrfToken() throws when the session cookie is missing.
    }
}

export function CwStateProvider({
    children,
    initialAuthorWhitelist = [],
    initialLabelWhitelist = [],
}: {
    children: ReactNode;
    /** Authors previously whitelisted via an author-level CW reveal (#229) — persists across sessions. */
    initialAuthorWhitelist?: string[];
    /** CW categories previously set to "always show" — applies to posts already in the queue when they were fetched. */
    initialLabelWhitelist?: CwCategory[];
}) {
    const [revealedPostIds, setRevealedPostIds] = useState(
        () => new Set<string>(),
    );
    const [revealedAuthors, setRevealedAuthors] = useState(
        () => new Set<string>(initialAuthorWhitelist),
    );
    // Tracks which authors we've already dispatched a persist call for, kept as a
    // ref (mutated synchronously, outside React's update queue) rather than in the
    // state updater below — a state updater must stay pure since React may replay
    // it, but a ref mutation happens exactly once per reveal() call and is visible
    // immediately to the next call, so it can't double-POST even if two reveal()s
    // for the same author land in the same batched update.
    // useRef(initialValue) evaluates initialValue on every render (only the first
    // is kept), so the Set is constructed lazily here instead of passed inline.
    const persistedAuthorsRef = useRef<Set<string> | null>(null);

    if (persistedAuthorsRef.current === null) {
        persistedAuthorsRef.current = new Set<string>(initialAuthorWhitelist);
    }

    const persistedAuthors = persistedAuthorsRef.current;

    const [revealedCategories, setRevealedCategories] = useState(
        () => new Set<CwCategory>(initialLabelWhitelist),
    );

    // Mirrors FeedAggregator::clearCwFieldsIfWhitelisted — every category the CW
    // touches must be whitelisted, so one allowed type can't hide an unrelated one.
    const isCategoryRevealed = (post: CwLike) =>
        !!post.cw_categories?.length &&
        post.cw_categories.every((category) =>
            revealedCategories.has(category),
        );

    const isRevealed = (post: CwLike) =>
        revealedPostIds.has(post.id) ||
        revealedAuthors.has(post.author_handle) ||
        isCategoryRevealed(post);

    const reveal = (post: CwLike) => {
        setRevealedPostIds((prev) => new Set(prev).add(post.id));

        // Only an author-level CW (the author's profile itself is labelled) unhides
        // future posts from them — a post-level accept must stay scoped to that one
        // post, or an unrelated later CW from the same author would be silently skipped.
        if (post.cw_is_author_level) {
            if (!persistedAuthors.has(post.author_handle)) {
                persistedAuthors.add(post.author_handle);
                persistAuthorWhitelist(post.author_handle);
            }

            setRevealedAuthors((prev) => new Set(prev).add(post.author_handle));
        }
    };

    const revealAlways = (post: CwLike) => {
        reveal(post);

        const categories = post.cw_categories ?? [];

        if (categories.length === 0) {
            return;
        }

        persistCategoryWhitelist(categories);
        setRevealedCategories((prev) => new Set([...prev, ...categories]));
    };

    return (
        <CwContext value={{ isRevealed, reveal, revealAlways }}>
            {children}
        </CwContext>
    );
}

export function useCwState() {
    const context = use(CwContext);

    if (!context) {
        throw new Error('useCwState must be used within a CwStateProvider.');
    }

    return context;
}
