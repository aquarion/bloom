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
    onProgress?: (index: number, elapsed: number) => void;
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

    const isPaused = paused;

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

    return (
        <div className="relative w-full overflow-hidden">
            {/* Sliding track — all images stay in DOM so container height is stable */}
            <div
                data-testid="carousel-track"
                className="flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
            >
                {media.map((item) => {
                    const src =
                        item.type === 'video'
                            ? (item.preview_url ?? undefined)
                            : item.url;

                    return (
                        <div
                            key={item.url ?? item.preview_url}
                            className="flex w-full flex-shrink-0 items-center justify-center"
                        >
                            {src && (
                                <img
                                    src={src}
                                    alt={item.alt_text ?? ''}
                                    className={`max-h-[60vh] max-w-full object-contain p-4 transition-[filter] duration-300 ${blurMedia ? 'blur-xl' : ''}`}
                                />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Dot indicators — only shown for multi-image posts */}
            {media.length > 1 && (
                <div className="pointer-events-none absolute right-0 bottom-2 left-0 flex justify-center gap-1.5">
                    {media.map((item, i) => (
                        <div
                            key={item.url ?? item.preview_url}
                            className={`h-1.5 w-1.5 rounded-full transition-colors duration-200 ${
                                i === activeIndex ? 'bg-white' : 'bg-white/40'
                            }`}
                        />
                    ))}
                </div>
            )}

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

            <button
                type="button"
                data-testid="carousel-prev"
                className={`absolute inset-y-0 left-0 w-1/2 cursor-default ${blurMedia ? 'pointer-events-none' : ''}`}
                aria-label="Previous image"
                onClick={handlePrev}
            />
            <button
                type="button"
                data-testid="carousel-next"
                className={`absolute inset-y-0 right-0 w-1/2 cursor-default ${blurMedia ? 'pointer-events-none' : ''}`}
                aria-label="Next image"
                onClick={handleNext}
            />
        </div>
    );
}
