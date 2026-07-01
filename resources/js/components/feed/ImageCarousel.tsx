import { useEffect, useRef, useState } from 'react';
import type { MediaAttachment } from '@/types/post';

const TICK_MS = 100;

export function ImageCarousel({
    media,
    duration,
    paused,
    blurMedia,
    onRevealMedia,
    onComplete,
    onProgress,
}: {
    media: MediaAttachment[];
    duration: number;
    paused: boolean;
    blurMedia: boolean;
    onRevealMedia: () => void;
    onComplete: () => void;
    onProgress?: (index: number, filled: number) => void;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const elapsedRef = useRef(0);
    const lastIndexRef = useRef(0);
    const onCompleteRef = useRef(onComplete);
    const onProgressRef = useRef(onProgress);

    useEffect(() => {
        onCompleteRef.current = onComplete;
        onProgressRef.current = onProgress;
    }, [onComplete, onProgress]);

    const isPaused = paused || blurMedia;

    // Run the per-image timer; reset elapsed only when activeIndex changes, not on pause/unpause
    useEffect(() => {
        if (lastIndexRef.current !== activeIndex) {
            lastIndexRef.current = activeIndex;
            elapsedRef.current = 0;
            onProgressRef.current?.(activeIndex, 0);
        }

        if (isPaused) {
            return;
        }

        const intervalId = setInterval(() => {
            elapsedRef.current += TICK_MS;
            const filled = Math.min(1, elapsedRef.current / duration);
            onProgressRef.current?.(activeIndex, filled);

            if (elapsedRef.current >= duration) {
                elapsedRef.current = 0;

                if (activeIndex < media.length - 1) {
                    setActiveIndex((i) => i + 1);
                } else {
                    clearInterval(intervalId);
                    onCompleteRef.current();
                }
            }
        }, TICK_MS);

        return () => clearInterval(intervalId);
    }, [isPaused, duration, activeIndex, media.length]);

    const handleNext = () => {
        if (activeIndex < media.length - 1) {
            setActiveIndex((i) => i + 1);
        } else {
            onCompleteRef.current();
        }
    };

    const handlePrev = () => {
        if (activeIndex > 0) {
            setActiveIndex((i) => i - 1);
        }
    };

    const current = media[activeIndex];
    const src =
        current?.type === 'video'
            ? (current.preview_url ?? undefined)
            : current?.url;

    return (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
            {/* Image */}
            {src && (
                <img
                    src={src}
                    alt={current?.alt_text ?? ''}
                    className={`h-full w-full object-contain p-4 transition-all duration-300 ${blurMedia ? 'blur-xl' : ''}`}
                />
            )}

            {/* Sensitive media overlay */}
            {blurMedia && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <button
                        type="button"
                        onClick={onRevealMedia}
                        className="rounded-full bg-black/60 px-4 py-1.5 text-sm text-white hover:bg-black/80"
                    >
                        Show sensitive media
                    </button>
                </div>
            )}

            {/* Tap zones */}
            <button
                type="button"
                data-testid="carousel-prev"
                className={`absolute top-0 left-0 h-full w-1/2 cursor-default ${blurMedia ? 'pointer-events-none' : ''}`}
                aria-label="Previous image"
                onClick={handlePrev}
            />
            <button
                type="button"
                data-testid="carousel-next"
                className={`absolute top-0 right-0 h-full w-1/2 cursor-default ${blurMedia ? 'pointer-events-none' : ''}`}
                aria-label="Next image"
                onClick={handleNext}
            />
        </div>
    );
}
