import { Head, Link } from '@inertiajs/react';
import { gsap } from 'gsap';
import { Eye, EyeOff, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Attribution } from '@/components/feed/Attribution';
import { DebugPanel } from '@/components/feed/DebugPanel';
import { KeyboardShortcutsOverlay } from '@/components/feed/KeyboardShortcutsOverlay';
import { PostBackground } from '@/components/feed/PostBackground';
import { PostContent } from '@/components/feed/PostContent';
import { ProgressBar } from '@/components/feed/ProgressBar';
import { SourceBadge } from '@/components/feed/SourceBadge';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { useFeedQueue } from '@/hooks/useFeedQueue';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useWakeLock } from '@/hooks/useWakeLock';
import { registerFeedDebug, setupDebugWindow } from '@/lib/debug';
import { edit as connectionsEdit } from '@/routes/connections';
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
        Escape: closeHelp,
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
                    />
                </div>

                {/* Chrome layer: never transitions */}
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
                    <div className="pointer-events-auto flex items-center gap-2 p-4">
                        <Link
                            href={connectionsEdit()}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                            aria-label="Home"
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
                </div>
            </div>
        </>
    );
}
