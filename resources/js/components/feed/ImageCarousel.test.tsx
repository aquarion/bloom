import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAttachment } from '@/types/post';
import { ImageCarousel } from './ImageCarousel';

const DURATION = 8000;
const TICK_MS = 100;

const makeImage = (url: string, alt = ''): MediaAttachment => ({
    type: 'image',
    url,
    preview_url: null,
    alt_text: alt || null,
});

const defaultProps = {
    duration: DURATION,
    paused: false,
    blurMedia: false,
    onRevealMedia: vi.fn(),
    onComplete: vi.fn(),
};

describe('ImageCarousel — single image', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('renders the image with its alt text', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg', 'a sunset')]}
            />,
        );
        expect(screen.getByAltText('a sunset')).toBeInTheDocument();
    });

    it('renders one progress bar for a single image', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
            />,
        );
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    });

    it('calls onComplete after the full duration elapses', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION + TICK_MS);
        });

        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('does not call onComplete before the duration elapses', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION - TICK_MS);
        });

        expect(onComplete).not.toHaveBeenCalled();
    });
});
