import { Head } from '@inertiajs/react';
import { gsap } from 'gsap';
import {
    AtSign,
    Eye,
    EyeOff,
    Pause,
    Play,
    SkipBack,
    SkipForward,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Attribution } from '@/components/feed/Attribution';
import { DebugPanel } from '@/components/feed/DebugPanel';
import { FeedSidebarPanel } from '@/components/feed/FeedSidebarPanel';
import { KeyboardShortcutsOverlay } from '@/components/feed/KeyboardShortcutsOverlay';
import { MentionChips } from '@/components/feed/MentionChips';
import { PostBackground } from '@/components/feed/PostBackground';
import { PostContent } from '@/components/feed/PostContent';
import { ProgressBar } from '@/components/feed/ProgressBar';
import { SourceBadge } from '@/components/feed/SourceBadge';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { useFeedQueue } from '@/hooks/useFeedQueue';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useWakeLock } from '@/hooks/useWakeLock';
import { registerFeedDebug, setupDebugWindow } from '@/lib/debug';
import type { Post } from '@/types/post';

function extractFirstLink(html: string): string | null {
    const match = html.match(/href="([^"]+)"/);

    return match?.[1] ?? null;
}

export default function Feed({
    initialPosts,
    initialCursor,
    debugEnabled,
    cwBehavior,
    sensitiveMediaBehavior,
}: {
    initialPosts: Post[];
    initialCursor: string | null;
    debugEnabled: boolean;
    cwBehavior: 'skip' | 'blur' | 'show';
    sensitiveMediaBehavior: 'skip' | 'blur' | 'show';
}) {
    const { current, advance, queue, goBack, canGoBack } = useFeedQueue({
        initialPosts,
        initialCursor,
        cwBehavior,
        sensitiveMediaBehavior,
    });
    const [paused, setPaused] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const [revealedAuthors, setRevealedAuthors] = useState(
        () => new Set<string>(),
    );

    const {
        isSupported: wakeLockSupported,
        isActive: wakeLockActive,
        toggle: toggleWakeLock,
    } = useWakeLock();
    const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
    const [carouselProgress, setCarouselProgress] = useState<{
        activeIndex: number;
        elapsed: number;
    } | null>(null);
    const animationReady = readyForPostId === current?.id;
    const bgRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    // Stores the timestamp when the transition is expected to finish; prevents
    // double-firing and self-heals if GSAP ever fails to fire onComplete.
    const transitionEndRef = useRef(0);

    // Bottom background layer shows this post. Updated only in onComplete (after
    // bgRef is back at opacity 1) so it never changes while visible mid-crossfade.
    const [nextBackground, setNextBackground] = useState<Post | null>(
        () => initialPosts[1] ?? initialPosts[0] ?? null,
    );

    useEffect(() => {
        if (debugEnabled) {
            (window as Window & { __APP_DEBUG?: boolean }).__APP_DEBUG = true;
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

    const handleCarouselProgress = (activeIndex: number, elapsed: number) =>
        setCarouselProgress({ activeIndex, elapsed });

    const handleAdvance = () => {
        const bg = bgRef.current;
        const content = contentRef.current;

        if (!bg || !content || Date.now() < transitionEndRef.current) {
            return;
        }

        setCarouselProgress(null);

        // advance() shifts queue[0] → current, so queue[1] becomes the new queue[0].
        // Capture now (before the queue changes) to update the bottom layer in onComplete.
        const nextNext: Post | null = queue[1] ?? queue[0] ?? current;

        transitionEndRef.current = Date.now() + 700;

        // Track whether advance() completed so onComplete doesn't update the
        // bottom layer if flushSync threw (GSAP swallows callback exceptions).
        let advanceSucceeded = false;

        gsap.timeline({
            // bgRef is back at opacity 1 — safe to update the bottom layer.
            onComplete: () => {
                if (advanceSucceeded) {
                    setNextBackground(nextNext);
                }
            },
        })
            // bg fade matches content zoom-out duration so both finish at t=0.3,
            // making the gsap.set(bg) in the call safe (no running tween to conflict).
            .to(bg, { opacity: 0, duration: 0.3, ease: 'power2.inOut' }, 0)
            .to(
                content,
                {
                    scale: 1.3,
                    filter: 'blur(8px)',
                    opacity: 0,
                    duration: 0.3,
                    ease: 'power2.in',
                },
                0,
            )
            .call(
                () => {
                    flushSync(() => advance());
                    advanceSucceeded = true;
                    gsap.set(bg, { opacity: 1 });
                },
                undefined,
                0.3,
            )
            .fromTo(
                content,
                { scale: 0.7, filter: 'blur(8px)', opacity: 0 },
                {
                    scale: 1,
                    filter: 'blur(0px)',
                    opacity: 1,
                    duration: 0.3,
                    ease: 'power2.out',
                },
                0.3,
            );
    };

    const handleGoBack = () => {
        goBack();
        setCarouselProgress(null);
        setPaused(true);
    };

    const handleRevealAuthor = (handle: string) => {
        setRevealedAuthors((prev) => new Set(prev).add(handle));
    };

    const openPost = () => {
        if (current) {
            window.open(current.original_url, '_blank', 'noopener,noreferrer');
        }
    };

    const openLink = () => {
        if (!current) {
            return;
        }

        const url = current.link_url ?? extractFirstLink(current.body);

        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const toggleHelp = () => setShowHelp((s) => !s);
    const closeHelp = () => setShowHelp(false);
    const closePanel = () => setPanelOpen(false);
    const handleEscape = () => {
        closePanel();
        closeHelp();
    };

    const { progress } = useAutoAdvance({
        duration: 8000,
        paused: paused || !animationReady,
        onAdvance: handleAdvance,
    });

    useKeyboardShortcuts({
        j: handleAdvance,
        k: handleGoBack,
        ' ': () => setPaused((p) => !p),
        o: openPost,
        l: openLink,
        '?': toggleHelp,
        h: () => setPanelOpen((o) => !o),
        Escape: handleEscape,
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

    return (
        <>
            <Head title="Feed" />
            <div className="relative h-screen w-screen overflow-hidden bg-black">
                {/* Background layer: bottom slot pre-renders next post's background */}
                <div className="absolute inset-0 z-0">
                    <PostBackground post={nextBackground ?? current} />
                    <div ref={bgRef} className="absolute inset-0 bg-black">
                        <PostBackground post={current} />
                    </div>
                </div>

                {/* Content layer: zoom/blur transition */}
                <div ref={contentRef} className="absolute inset-0 z-10">
                    <PostContent
                        key={current.id}
                        post={current}
                        onReady={() => setReadyForPostId(current.id)}
                        onAdvance={handleAdvance}
                        onProgress={
                            current.media.length > 0
                                ? handleCarouselProgress
                                : undefined
                        }
                        cwBehavior={cwBehavior}
                        sensitiveMediaBehavior={sensitiveMediaBehavior}
                        paused={paused}
                        authorCwRevealed={revealedAuthors.has(
                            current.author_handle,
                        )}
                        onRevealAuthor={() =>
                            handleRevealAuthor(current.author_handle)
                        }
                    />
                </div>

                {/* Chrome layer: never transitions */}
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
                    <div className="pointer-events-auto flex items-center gap-2 p-4">
                        <button
                            type="button"
                            onClick={() => setPanelOpen((o) => !o)}
                            className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white ${panelOpen ? 'relative z-[51]' : ''}`}
                            aria-label="Open navigation"
                            aria-expanded={panelOpen}
                            aria-haspopup="dialog"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 1200 1200"
                                fill="currentColor"
                                className="h-4 w-4"
                                aria-hidden="true"
                            >
                                <path d="m1123 575-47.67-47.67c-33.64-33.4-74.28-58.91-119-74.66 20.54-42.76 31.25-89.57 31.34-137v-66.67c0-9.46-3.76-18.53-10.45-25.22-6.69-6.69-15.76-10.45-25.22-10.45h-66.67c-47.43 0.09-94.24 10.79-137 31.34-15.8-44.59-41.3-85.12-74.66-118.67l-48.34-49c-6.73-6.57-15.76-10.26-25.16-10.26-9.41 0-18.44 3.68-25.17 10.26l-47.67 47.67c-33.36 33.54-58.86 74.07-74.66 118.66-42.76-20.54-89.57-31.25-137-31.33h-66.67c-9.63-0.18-18.93 3.54-25.77 10.32s-10.65 16.04-10.56 25.68v66.67c0.08 47.43 10.79 94.24 31.33 137-44.71 15.77-85.36 41.27-119 74.66l-48 48.67c-6.66 6.68-10.39 15.73-10.39 25.17 0 9.43 3.74 18.48 10.39 25.16l47.67 47.67c33.64 33.41 74.28 58.91 119 74.67-20.54 42.75-31.25 89.57-31.34 137v66.67-0c0 9.46 3.76 18.53 10.45 25.22 6.69 6.69 15.76 10.45 25.22 10.45h66.67c47.43-0.09 94.24-10.79 137-31.33 15.79 44.6 41.29 85.13 74.66 118.66l47.67 47.67c6.73 6.57 15.76 10.26 25.17 10.26 9.41 0 18.44-3.68 25.16-10.26l47.67-47.67c33.37-33.53 58.88-74.07 74.67-118.66 42.75 20.54 89.57 31.25 137 31.33h66.67-0c9.46 0 18.53-3.76 25.22-10.45 6.69-6.69 10.45-15.76 10.45-25.22v-66.67 0c-0.09-47.43-10.79-94.25-31.33-137 44.59-15.8 85.12-41.3 118.66-74.67l47.67-47.67c6.85-6.46 10.89-15.35 11.27-24.76 0.38-9.41-2.95-18.59-9.27-25.57zm-206.33-291.33v33.33c-0.59 54.2-18.79 106.73-51.86 149.66-33.07 42.94-79.22 73.94-131.47 88.34-14.21-41.51-46.82-74.12-88.33-88.33 14.72-52.28 46.08-98.32 89.33-131.17s96.03-50.69 150.34-50.83zm-316.67 387.33c-18.81-0.09-36.82-7.64-50.07-20.99-13.25-13.35-20.66-31.42-20.6-50.23 0.06-18.81 7.58-36.83 20.91-50.1 13.33-13.27 31.39-20.71 50.2-20.68 18.81 0.03 36.84 7.52 50.13 20.84 13.29 13.31 20.75 31.35 20.75 50.16-0.09 18.86-7.64 36.92-21.01 50.23-13.37 13.3-31.46 20.77-50.32 20.77zm-22.67-496 22.67-22.67 22.67 22.67c29.76 29.86 51.44 66.79 63 107.33-35.62 28.33-64.81 63.89-85.67 104.34-20.89-40.33-50.09-75.77-85.67-104 11.51-40.66 33.2-77.72 63-107.67zm-293.66 108.67h33.33c54.21 0.49 106.78 18.61 149.78 51.63 43 33.02 74.08 79.13 88.55 131.37-41.64 14.13-74.38 46.75-88.66 88.33-52.46-14.54-98.73-45.82-131.77-89.09-33.04-43.27-51.03-96.14-51.23-150.58zm-108.67 339-22.33-22.67 22.67-22.67h-0c29.87-29.75 66.8-51.42 107.34-63 28.23 35.58 63.67 64.77 104 85.67-40.33 20.89-75.77 50.09-104 85.67-40.66-11.53-77.71-33.21-107.67-63zm108.67 294v-33.34c0.49-54.21 18.61-106.78 51.63-149.78 33.02-43 79.13-74.08 131.37-88.56 14.29 41.58 47.03 74.2 88.66 88.33-14.66 52.34-45.99 98.46-89.25 131.37-43.26 32.91-96.07 50.8-150.42 50.97zm339 108.33-22.67 22.67-22.67-22.67c-29.76-29.86-51.44-66.79-63-107.33 35.62-28.33 64.81-63.89 85.67-104.34 20.89 40.33 50.09 75.77 85.67 104-11.51 40.66-33.2 77.72-63 107.67zm294-108.33h-33.34c-54.25-0.52-106.86-18.69-149.86-51.77s-74.06-79.27-88.47-131.57c41.51-14.21 74.12-46.82 88.33-88.33 52.34 14.66 98.46 45.99 131.37 89.25 32.91 43.25 50.8 96.07 50.97 150.42zm108.33-294c-29.86 29.76-66.79 51.44-107.33 63-28.23-35.58-63.68-64.77-104-85.67 40.32-20.89 75.77-50.09 104-85.67 40.54 11.56 77.47 33.24 107.33 63l22.67 22.67z" />
                            </svg>
                        </button>
                        {wakeLockSupported && (
                            <button
                                type="button"
                                onClick={toggleWakeLock}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                                aria-label={
                                    wakeLockActive
                                        ? 'Disable keep-awake'
                                        : 'Enable keep-awake'
                                }
                                aria-pressed={wakeLockActive}
                            >
                                {wakeLockActive ? (
                                    <Eye className="h-4 w-4" />
                                ) : (
                                    <EyeOff className="h-4 w-4" />
                                )}
                            </button>
                        )}
                        {debugEnabled && (
                            <DebugPanel current={current} queue={queue} />
                        )}
                        <SourceBadge post={current} />
                    </div>

                    <div className="flex-1" />

                    <div className="pointer-events-auto flex items-center gap-2 px-4 pt-2 pb-3">
                        <Attribution post={current} />
                        {current.chip_mentions.length > 0 && (
                            <>
                                <AtSign className="size-4 flex-shrink-0 text-white/30" />
                                <MentionChips
                                    mentions={current.chip_mentions}
                                />
                            </>
                        )}
                        <button
                            type="button"
                            onClick={handleGoBack}
                            disabled={!canGoBack}
                            className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10 disabled:hover:text-white/60"
                            aria-label="Previous"
                        >
                            <SkipBack className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setPaused((p) => !p)}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                            aria-label={paused ? 'Resume' : 'Pause'}
                            aria-pressed={paused}
                        >
                            {paused ? (
                                <Play className="h-4 w-4" />
                            ) : (
                                <Pause className="h-4 w-4" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={handleAdvance}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                            aria-label="Next"
                        >
                            <SkipForward className="h-4 w-4" />
                        </button>
                    </div>

                    {current.media.length > 0 ? (
                        <ProgressBar
                            segments={{
                                count: current.media.length,
                                activeIndex: carouselProgress?.activeIndex ?? 0,
                                elapsed: carouselProgress?.elapsed ?? 0,
                            }}
                        />
                    ) : (
                        <ProgressBar progress={progress} />
                    )}
                    <KeyboardShortcutsOverlay open={showHelp} />
                    <FeedSidebarPanel
                        open={panelOpen}
                        onOpenChange={setPanelOpen}
                    />
                </div>
            </div>
        </>
    );
}
