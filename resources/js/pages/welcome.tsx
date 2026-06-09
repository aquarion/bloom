import { Head, Link } from '@inertiajs/react';
import { gsap } from 'gsap';
import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import AppLogoIcon from '@/components/app-logo-icon';
import { Attribution } from '@/components/feed/Attribution';
import { PostBackground } from '@/components/feed/PostBackground';
import { PostContent } from '@/components/feed/PostContent';
import { ProgressBar } from '@/components/feed/ProgressBar';
import { SourceBadge } from '@/components/feed/SourceBadge';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { useWelcomeQueue } from '@/hooks/useWelcomeQueue';
import { login, register } from '@/routes';
import type { Post } from '@/types/post';

export default function Welcome({
    initialPosts,
    canRegister = true,
}: {
    initialPosts: Post[];
    canRegister?: boolean;
}) {
    const { current, advance, queue } = useWelcomeQueue(initialPosts);
    const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
    const animationReady = readyForPostId === current?.id;
    const bgRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const transitionEndRef = useRef(0);
    const [nextBackground, setNextBackground] = useState<Post | null>(
        () => initialPosts[1] ?? initialPosts[0] ?? null,
    );

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

    const { progress } = useAutoAdvance({
        duration: 8000,
        paused: !animationReady,
        onAdvance: handleAdvance,
    });

    if (!current) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white">
                <p className="text-sm opacity-50">No posts available.</p>
            </div>
        );
    }

    return (
        <>
            <Head title="Bloom — social media without the scroll" />
            <div className="relative h-screen w-screen overflow-hidden bg-black">
                {/* Background layer */}
                <div className="absolute inset-0 z-0">
                    <PostBackground post={nextBackground ?? current} />
                    <div ref={bgRef} className="absolute inset-0 bg-black">
                        <PostBackground post={current} />
                    </div>
                </div>

                {/* Content layer */}
                <div ref={contentRef} className="absolute inset-0 z-10">
                    <PostContent
                        post={current}
                        onReady={() => setReadyForPostId(current.id)}
                    />
                </div>

                {/* Chrome layer */}
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
                    <div className="pointer-events-auto flex items-center gap-2 p-4">
                        <SourceBadge post={current} />
                    </div>

                    <div className="flex-1" />

                    <div className="pointer-events-auto flex max-w-sm flex-col gap-4 px-4 pt-2 pb-6">
                        <Attribution post={current} />

                        <div className="border-white/10 border-t pt-4">
                            <div className="mb-1 flex items-center gap-2">
                                <AppLogoIcon
                                    className="size-5"
                                    aria-hidden="true"
                                />
                                <span className="font-semibold text-white/50 text-xs uppercase tracking-wide">
                                    Bloom
                                </span>
                            </div>
                            <p className="mb-1 font-semibold text-lg text-white leading-tight">
                                Social media. Without the scroll.
                            </p>
                            <p className="mb-4 text-white/40 text-xs">
                                Full-screen · Mastodon &amp; Bluesky · No
                                algorithm
                            </p>
                            <div className="flex gap-3">
                                {canRegister && (
                                    <Link
                                        href={register()}
                                        className="flex-1 rounded-lg bg-white py-3 text-center font-semibold text-black text-sm hover:bg-white/90"
                                    >
                                        Sign up
                                    </Link>
                                )}
                                <Link
                                    href={login()}
                                    className="flex-1 rounded-lg border border-white/20 bg-white/10 py-3 text-center font-medium text-sm text-white/80 hover:bg-white/15"
                                >
                                    Log in
                                </Link>
                            </div>
                        </div>
                    </div>

                    <ProgressBar progress={progress} />
                </div>
            </div>
        </>
    );
}
