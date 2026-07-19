import { createContext, use, useState } from 'react';
import type { ReactNode } from 'react';
import type { CwLike } from '@/lib/cw';

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

    const isRevealed = (post: CwLike) =>
        revealedPostIds.has(post.id) || revealedAuthors.has(post.author_handle);

    const reveal = (post: CwLike) => {
        setRevealedPostIds((prev) => new Set(prev).add(post.id));

        // Only an author-level CW (the author's profile itself is labelled) unhides
        // future posts from them — a post-level accept must stay scoped to that one
        // post, or an unrelated later CW from the same author would be silently skipped.
        if (post.cw_is_author_level) {
            setRevealedAuthors((prev) => new Set(prev).add(post.author_handle));
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
