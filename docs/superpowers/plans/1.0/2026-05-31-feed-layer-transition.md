# Feed Layer Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `PostCard` with a three-layer model so backgrounds crossfade directly between posts and static chrome elements never participate in transitions.

**Architecture:** Background layer (two stacked `PostBackground` slots crossfade), content layer (zoom/blur transition), chrome layer (static — home, source badge, pause, progress bar). The bottom background pre-renders `queue[0]` so the destination background is always visible before the top one fades out.

**Tech Stack:** React, GSAP, Tailwind CSS, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `resources/js/components/feed/PostBackground.tsx` | Renders one post's background (solid colour / media / banner / black) |
| Create | `resources/js/components/feed/PostContent.tsx` | PostAnimator centred in a full-size container; no chrome, no background |
| Modify | `resources/js/pages/feed.tsx` | Three-layer layout; chrome ownership; crossfade `handleAdvance` |
| Delete | `resources/js/components/feed/PostCard.tsx` | Superseded by PostBackground + PostContent |

Unchanged: `PostAnimator`, `MediaBackground`, `Attribution`, `SourceBadge`, `ProgressBar`, `AuthorChip`, all hooks.

---

## Task 1: Create `PostBackground`

**Files:**
- Create: `resources/js/components/feed/PostBackground.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { postColors } from "@/lib/post-colors";
import type { Post } from "@/types/post";
import { MediaBackground } from "./MediaBackground";

export function PostBackground({ post }: { post: Post }) {
    const hasMedia = post.media.length > 0;
    const hasBanner = !hasMedia && !!post.author_banner;
    const colors = hasMedia || hasBanner ? null : postColors(post.author_handle);

    return (
        <div
            className="absolute inset-0"
            style={colors ? { backgroundColor: colors.background } : undefined}
        >
            {hasMedia && <MediaBackground media={post.media} />}
            {hasBanner && (
                <img
                    src={post.author_banner!}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ opacity: 0.7, filter: "blur(24px)", transform: "scale(1.1)" }}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/aquarion/code/aquarion/sprouter && npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors in `PostBackground.tsx`.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/feed/PostBackground.tsx
git commit -m "🎇 Add PostBackground component"
```

---

## Task 2: Create `PostContent`

**Files:**
- Create: `resources/js/components/feed/PostContent.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { postColors } from "@/lib/post-colors";
import type { Post } from "@/types/post";
import { PostAnimator } from "./PostAnimator";

export function PostContent({
    post,
    onReady,
}: {
    post: Post;
    onReady?: () => void;
}) {
    const hasMedia = post.media.length > 0;
    const hasBanner = !hasMedia && !!post.author_banner;
    const colors = hasMedia || hasBanner ? null : postColors(post.author_handle);

    return (
        <div className="flex h-full w-full items-center justify-center">
            <PostAnimator post={post} colors={colors} onReady={onReady} />
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/feed/PostContent.tsx
git commit -m "🎇 Add PostContent component"
```

---

## Task 3: Restructure `feed.tsx` with three layers and crossfade transition

**Files:**
- Modify: `resources/js/pages/feed.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
import { Head, Link } from "@inertiajs/react";
import { gsap } from "gsap";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Attribution } from "@/components/feed/Attribution";
import { PostBackground } from "@/components/feed/PostBackground";
import { PostContent } from "@/components/feed/PostContent";
import { ProgressBar } from "@/components/feed/ProgressBar";
import { SourceBadge } from "@/components/feed/SourceBadge";
import { useAutoAdvance } from "@/hooks/useAutoAdvance";
import { useFeedQueue } from "@/hooks/useFeedQueue";
import { registerFeedDebug, setupDebugWindow } from "@/lib/debug";
import type { Post } from "@/types/post";

export default function Feed({
    initialPosts,
    initialCursor,
    debugEnabled,
}: {
    initialPosts: Post[];
    initialCursor: string | null;
    debugEnabled: boolean;
}) {
    const { current, advance, queue } = useFeedQueue({
        initialPosts,
        initialCursor,
    });
    const [paused, setPaused] = useState(false);
    const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
    const animationReady = readyForPostId === current?.id;
    const bgRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    // Stores the timestamp when the transition is expected to finish; prevents
    // double-firing and self-heals if GSAP ever fails to fire onComplete.
    const transitionEndRef = useRef(0);

    useEffect(() => {
        if (debugEnabled) {
            (window as any).__APP_DEBUG = true;
            setupDebugWindow();
        }
    }, [debugEnabled]);

    useEffect(() => {
        registerFeedDebug({
            current,
            queue,
            cursor: initialCursor,
        });
    }, [current, queue, initialCursor]);

    const handleAdvance = useCallback(() => {
        const bg = bgRef.current;
        const content = contentRef.current;

        if (!bg || !content || Date.now() < transitionEndRef.current) {
            return;
        }

        transitionEndRef.current = Date.now() + 700;

        gsap
            .timeline()
            .to(bg, { opacity: 0, duration: 0.4, ease: "power2.inOut" }, 0)
            .to(
                content,
                {
                    scale: 1.3,
                    filter: "blur(8px)",
                    opacity: 0,
                    duration: 0.3,
                    ease: "power2.in",
                },
                0,
            )
            .call(() => flushSync(() => advance()), undefined, 0.3)
            .fromTo(
                content,
                { scale: 0.7, filter: "blur(8px)", opacity: 0 },
                {
                    scale: 1,
                    filter: "blur(0px)",
                    opacity: 1,
                    duration: 0.3,
                    ease: "power2.out",
                },
                0.3,
            )
            .set(bg, { opacity: 1 }, 0.6);
    }, [advance]);

    const { progress } = useAutoAdvance({
        duration: 8000,
        paused: paused || !animationReady,
        onAdvance: handleAdvance,
    });

    if (!current) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white">
                <p className="text-sm opacity-50">
                    No posts — connect an account in Settings.
                </p>
            </div>
        );
    }

    const nextPost = queue[0] ?? current;

    return (
        <>
            <Head title="Feed" />
            <div className="relative h-screen w-screen overflow-hidden bg-black">
                {/* Background layer: bottom slot pre-renders next post's background */}
                <div className="absolute inset-0 z-0">
                    <PostBackground post={nextPost} />
                    <div ref={bgRef} className="absolute inset-0">
                        <PostBackground post={current} />
                    </div>
                </div>

                {/* Content layer: zoom/blur transition */}
                <div ref={contentRef} className="absolute inset-0 z-10">
                    <PostContent
                        post={current}
                        onReady={() => setReadyForPostId(current.id)}
                    />
                </div>

                {/* Chrome layer: never transitions */}
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
                    <div className="pointer-events-auto flex items-center gap-2 p-4">
                        <Link
                            href="/dashboard"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                            aria-label="Dashboard"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-4 w-4"
                                aria-hidden="true"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </Link>
                        <SourceBadge post={current} />
                    </div>

                    <div className="flex-1" />

                    <div className="pointer-events-auto flex items-center gap-2 px-4 pb-3 pt-2">
                        <Attribution post={current} />
                        <button
                            type="button"
                            onClick={() => setPaused((p) => !p)}
                            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                            aria-label={paused ? "Resume" : "Pause"}
                        >
                            {paused ? (
                                <Play className="h-4 w-4" />
                            ) : (
                                <Pause className="h-4 w-4" />
                            )}
                        </button>
                    </div>

                    <ProgressBar progress={progress} />
                </div>
            </div>
        </>
    );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run build 2>&1 | tail -30
```

Expected: no TypeScript errors. `PostCard` import is gone from feed.tsx; PostBackground and PostContent are imported instead.

- [ ] **Step 3: Run PHP tests to confirm nothing backend-related broke**

```bash
./vendor/bin/pest --stop-on-failure 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/feed.tsx
git commit -m "🖼️ Restructure feed into background/content/chrome layers with crossfade transition"
```

---

## Task 4: Delete `PostCard` and verify no dangling imports

**Files:**
- Delete: `resources/js/components/feed/PostCard.tsx`

- [ ] **Step 1: Confirm PostCard has no remaining consumers**

```bash
grep -r "PostCard" /home/aquarion/code/aquarion/sprouter/resources --include="*.tsx" --include="*.ts"
```

Expected: zero results (feed.tsx no longer imports it).

- [ ] **Step 2: Delete the file**

```bash
rm resources/js/components/feed/PostCard.tsx
```

- [ ] **Step 3: Type-check and test**

```bash
npm run build 2>&1 | tail -20 && ./vendor/bin/pest --stop-on-failure 2>&1 | tail -10
```

Expected: build passes, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add -u resources/js/components/feed/PostCard.tsx
git commit -m "❌ Remove PostCard (superseded by PostBackground + PostContent)"
```

---

## Verification

- [ ] Start the dev server and open the feed in a browser
- [ ] Advance through several posts and confirm backgrounds crossfade directly (no black flash)
- [ ] Confirm the home button, source badge, pause button, and progress bar remain visible and static throughout transitions
- [ ] Confirm the pause button still pauses/resumes correctly
- [ ] Confirm the progress bar still advances and resets on post change
