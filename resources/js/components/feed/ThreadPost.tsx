import { useEffect, useRef, useState } from 'react';
import type { Post } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';
import { PostContent } from './PostContent';

const TICK_MS = 100;

export function ThreadPost({
    thread,
    duration,
    paused = false,
    onAdvance,
    onProgress,
    cwBehavior = 'show',
    sensitiveMediaBehavior = 'show',
}: {
    thread: Post[];
    duration: number;
    paused?: boolean;
    onAdvance?: () => void;
    onProgress?: (index: number, elapsed: number) => void;
    cwBehavior?: ContentBehavior;
    sensitiveMediaBehavior?: ContentBehavior;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    // Set once the active entry's own PostContent fires onReady — an entry with
    // its own media never fires this (mirrors MediaPost), so the timer below
    // simply never starts and the nested ImageCarousel drives advancement instead.
    const [readyIndex, setReadyIndex] = useState<number | null>(null);
    const elapsedRef = useRef(0);
    const onAdvanceRef = useRef(onAdvance);
    const onProgressRef = useRef(onProgress);

    useEffect(() => {
        onAdvanceRef.current = onAdvance;
        onProgressRef.current = onProgress;
    }, [onAdvance, onProgress]);

    const ready = readyIndex === activeIndex;

    // Reported at the point activeIndex actually changes (not via an effect) so
    // the progress reset isn't delayed by an extra render.
    const advanceTo = (nextIndex: number) => {
        elapsedRef.current = 0;
        onProgressRef.current?.(nextIndex, 0);
        setActiveIndex(nextIndex);
    };

    const handleSubAdvance = () => {
        if (activeIndex < thread.length - 1) {
            advanceTo(activeIndex + 1);
        } else {
            onAdvanceRef.current?.();
        }
    };

    // Run the per-entry timer once the active entry is ready.
    useEffect(() => {
        if (paused || !ready) {
            return;
        }

        const intervalId = setInterval(() => {
            elapsedRef.current += TICK_MS;
            const filled = Math.min(1, elapsedRef.current / duration);
            onProgressRef.current?.(activeIndex, filled);

            if (elapsedRef.current >= duration) {
                clearInterval(intervalId);

                if (activeIndex < thread.length - 1) {
                    advanceTo(activeIndex + 1);
                } else {
                    onAdvanceRef.current?.();
                }
            }
        }, TICK_MS);

        return () => clearInterval(intervalId);
    }, [paused, ready, duration, activeIndex, thread.length]);

    const current = thread[activeIndex];

    return (
        <PostContent
            key={current.id}
            post={current}
            onReady={() => setReadyIndex(activeIndex)}
            onAdvance={handleSubAdvance}
            paused={paused}
            cwBehavior={cwBehavior}
            sensitiveMediaBehavior={sensitiveMediaBehavior}
        />
    );
}
