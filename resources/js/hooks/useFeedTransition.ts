import { gsap } from 'gsap';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Post } from '@/types/post';

export function useFeedTransition({
    current,
    queue,
    advance,
    initialPosts,
}: {
    current: Post | null;
    queue: Post[];
    advance: () => void;
    initialPosts: Post[];
}) {
    const bgRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    // The timeline itself only runs 600ms (two sequential 300ms tweens); this
    // adds a 100ms safety buffer so a slightly-late onComplete can't be
    // mistaken for a stuck transition. Don't tighten this to 600 — prevents
    // double-firing and self-heals if GSAP ever fails to fire onComplete at all.
    const transitionEndRef = useRef(0);

    // Bottom background layer shows this post. Updated only in onComplete (after
    // bgRef is back at opacity 1) so it never changes while visible mid-crossfade.
    const [nextBackground, setNextBackground] = useState<Post | null>(
        () => initialPosts[1] ?? initialPosts[0] ?? null,
    );

    const [carouselProgress, setCarouselProgress] = useState<{
        activeIndex: number;
        elapsed: number;
    } | null>(null);

    const handleCarouselProgress = (activeIndex: number, elapsed: number) =>
        setCarouselProgress({ activeIndex, elapsed });

    const resetCarouselProgress = () => setCarouselProgress(null);

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
                    try {
                        flushSync(() => advance());
                        advanceSucceeded = true;
                    } catch (error) {
                        // GSAP swallows exceptions thrown inside .call()
                        // callbacks, so without this the failure vanishes
                        // with no trace. advanceSucceeded stays false —
                        // the queue never actually shifted, so nextNext
                        // (computed from the pre-failure queue) would be
                        // wrong to commit as the new background.
                        console.error(
                            '[useFeedTransition] Failed to advance the feed queue',
                            error,
                        );
                    } finally {
                        // Always restore bg opacity, even on failure —
                        // otherwise the background layer is left invisible
                        // until the user manually retries.
                        gsap.set(bg, { opacity: 1 });
                    }
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

    return {
        bgRef,
        contentRef,
        nextBackground,
        carouselProgress,
        handleAdvance,
        handleCarouselProgress,
        resetCarouselProgress,
    };
}
