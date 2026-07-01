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
import { useCallback, useEffect, useRef, useState } from 'react';
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

    const {
        isSupported: wakeLockSupported,
        isActive: wakeLockActive,
        toggle: toggleWakeLock,
    } = useWakeLock();
    const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
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

    const handleAdvance = useCallback(() => {
        const bg = bgRef.current;
        const content = contentRef.current;

        if (!bg || !content || Date.now() < transitionEndRef.current) {
            return;
        }

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
    }, [advance, current, queue]);

    const handleGoBack = useCallback(() => {
        goBack();
        setPaused(true);
    }, [goBack]);

    const openPost = useCallback(() => {
        if (current) {
            window.open(current.original_url, '_blank', 'noopener,noreferrer');
        }
    }, [current]);

    const openLink = useCallback(() => {
        if (!current) {
            return;
        }

        const url = current.link_url ?? extractFirstLink(current.body);

        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }, [current]);

    const toggleHelp = useCallback(() => setShowHelp((s) => !s), []);
    const closeHelp = useCallback(() => setShowHelp(false), []);
    const closePanel = useCallback(() => setPanelOpen(false), []);
    const handleEscape = useCallback(() => {
        closePanel();
        closeHelp();
    }, [closePanel, closeHelp]);

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
                        cwBehavior={cwBehavior}
                        sensitiveMediaBehavior={sensitiveMediaBehavior}
                        paused={paused}
                    />
                </div>

                {/* Chrome layer: never transitions */}
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
                    <div className="pointer-events-auto flex items-center gap-2 p-4">
                        <button
                            type="button"
                            onClick={() => setPanelOpen((o) => !o)}
                            className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white${panelOpen ? 'relative z-[51]' : ''}`}
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
                                <path d="m1123 575-47.668-47.668c-33.637-33.402-74.285-58.91-119-74.664 20.543-42.758 31.25-89.566 31.336-137v-66.668c0-9.4609-3.7578-18.531-10.449-25.219-6.6875-6.6914-15.758-10.449-25.219-10.449h-66.668c-47.434 0.085938-94.242 10.793-137 31.336-15.801-44.594-41.301-85.125-74.664-118.67l-48.336-49c-6.7266-6.5742-15.758-10.258-25.164-10.258-9.4102 0-18.441 3.6836-25.168 10.258l-47.668 47.668c-33.363 33.543-58.863 74.07-74.664 118.66-42.758-20.539-89.566-31.246-137-31.332h-66.668c-9.6328-0.17969-18.93 3.543-25.773 10.324s-10.652 16.043-10.559 25.676v66.668c0.082031 47.434 10.789 94.242 31.332 137-44.707 15.766-85.355 41.27-119 74.664l-48 48.668c-6.6562 6.6836-10.395 15.734-10.395 25.168 0 9.4336 3.7383 18.48 10.395 25.164l47.668 47.668c33.637 33.406 74.285 58.91 119 74.668-20.543 42.754-31.25 89.566-31.336 137v66.668-0.003907c0 9.4609 3.7578 18.531 10.449 25.223 6.6875 6.6875 15.758 10.445 25.219 10.445h66.668c47.434-0.085938 94.242-10.793 137-31.332 15.789 44.598 41.293 85.129 74.664 118.66l47.668 47.668c6.7266 6.5742 15.758 10.258 25.168 10.258 9.4062 0 18.438-3.6836 25.164-10.258l47.668-47.668c33.371-33.535 58.875-74.066 74.668-118.66 42.754 20.539 89.566 31.246 137 31.332h66.668-0.003907c9.4609 0 18.531-3.7578 25.223-10.445 6.6875-6.6914 10.445-15.762 10.445-25.223v-66.668 0.003907c-0.085938-47.434-10.793-94.246-31.332-137 44.594-15.801 85.121-41.305 118.66-74.668l47.668-47.668c6.8516-6.4609 10.895-15.348 11.27-24.758 0.375-9.4102-2.9531-18.59-9.2695-25.574zm-206.33-291.33v33.332c-0.58594 54.195-18.793 106.73-51.863 149.66-33.074 42.938-79.223 73.945-131.47 88.34-14.215-41.512-46.82-74.117-88.332-88.332 14.719-52.277 46.082-98.324 89.332-131.17s96.027-50.691 150.34-50.832zm-316.67 387.33c-18.812-0.089844-36.816-7.6367-50.066-20.992-13.25-13.352-20.66-31.418-20.602-50.23 0.058594-18.809 7.582-36.828 20.914-50.098 13.332-13.27 31.387-20.707 50.199-20.68 18.809 0.03125 36.84 7.5234 50.133 20.836 13.289 13.312 20.754 31.352 20.754 50.164-0.085937 18.859-7.6406 36.918-21.008 50.227-13.371 13.305-31.465 20.773-50.324 20.773zm-22.668-496 22.668-22.668 22.668 22.668c29.758 29.859 51.438 66.793 63 107.33-35.617 28.328-64.812 63.891-85.668 104.34-20.895-40.328-50.09-75.77-85.668-104 11.512-40.66 33.195-77.715 63-107.67zm-293.66 108.67h33.332c54.207 0.49219 106.78 18.613 149.78 51.629 42.996 33.016 74.078 79.129 88.551 131.37-41.637 14.129-74.379 46.75-88.664 88.332-52.461-14.535-98.734-45.82-131.77-89.086-33.039-43.266-51.027-96.145-51.23-150.58zm-108.67 339-22.332-22.668 22.668-22.668h-0.003907c29.871-29.746 66.801-51.422 107.34-63 28.23 35.578 63.672 64.773 104 85.668-40.328 20.895-75.77 50.09-104 85.668-40.656-11.527-77.707-33.207-107.67-63zm108.67 294v-33.336c0.49219-54.207 18.613-106.78 51.629-149.78 33.016-43 79.129-74.082 131.37-88.555 14.285 41.582 47.027 74.203 88.664 88.332-14.656 52.336-45.992 98.461-89.246 131.37-43.258 32.906-96.07 50.801-150.42 50.965zm339 108.33-22.668 22.668-22.668-22.668c-29.758-29.859-51.438-66.793-63-107.33 35.617-28.328 64.812-63.891 85.668-104.34 20.895 40.328 50.09 75.77 85.668 104-11.512 40.66-33.195 77.715-63 107.67zm294-108.33h-33.336c-54.25-0.51562-106.86-18.688-149.86-51.766s-74.062-79.266-88.473-131.57c41.512-14.215 74.117-46.82 88.332-88.332 52.336 14.656 98.461 45.992 131.37 89.25 32.906 43.254 50.801 96.066 50.965 150.42zm108.33-294c-29.859 29.758-66.793 51.438-107.33 63-28.23-35.578-63.676-64.773-104-85.668 40.324-20.895 75.77-50.09 104-85.668 40.539 11.562 77.473 33.242 107.33 63l22.668 22.668z" />
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

                    <ProgressBar progress={progress} />
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
