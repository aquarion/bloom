import { act, fireEvent, render, screen } from '@testing-library/react';
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

    it('reports progress via onProgress callback on each tick', () => {
        const onProgress = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                onProgress={onProgress}
            />,
        );

        act(() => vi.advanceTimersByTime(TICK_MS));

        expect(onProgress).toHaveBeenCalledWith(0, TICK_MS / DURATION);
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

describe('ImageCarousel — multiple images', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('reports updated index in onProgress after auto-advance', () => {
        const onProgress = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg'),
                    makeImage('b.jpg'),
                    makeImage('c.jpg'),
                ]}
                onProgress={onProgress}
            />,
        );

        act(() => vi.advanceTimersByTime(DURATION + TICK_MS));

        const latestCall = onProgress.mock.calls.at(-1);
        expect(latestCall?.[0]).toBe(1);
    });

    it('shows the first image initially', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg', 'first'),
                    makeImage('b.jpg', 'second'),
                ]}
            />,
        );
        expect(screen.getByAltText('first')).toBeInTheDocument();
        expect(screen.getByAltText('second')).toBeInTheDocument();
        expect(screen.getByTestId('carousel-track')).toHaveStyle(
            'transform: translateX(-0%)',
        );
    });

    it('advances to the second image after one duration elapses', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg', 'first'),
                    makeImage('b.jpg', 'second'),
                ]}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION + TICK_MS);
        });

        expect(screen.getByTestId('carousel-track')).toHaveStyle(
            'transform: translateX(-100%)',
        );
    });

    it('calls onComplete only after all images have been shown', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg'), makeImage('b.jpg')]}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION + TICK_MS); // after image 1
        });
        expect(onComplete).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(DURATION); // after image 2
        });
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('advances to next image when right tap zone is clicked', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg', 'first'),
                    makeImage('b.jpg', 'second'),
                ]}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-next'));

        expect(screen.getByTestId('carousel-track')).toHaveStyle(
            'transform: translateX(-100%)',
        );
    });

    it('calls onComplete immediately when right tap zone is clicked on the last image', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg', 'first')]}
                onComplete={onComplete}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-next'));

        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('goes back to the previous image when left tap zone is clicked', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg', 'first'),
                    makeImage('b.jpg', 'second'),
                ]}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-next'));
        expect(screen.getByAltText('second')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('carousel-prev'));
        expect(screen.getByAltText('first')).toBeInTheDocument();
    });

    it('does nothing when left tap zone is clicked on the first image', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg', 'first'),
                    makeImage('b.jpg', 'second'),
                ]}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-prev'));

        expect(screen.getByAltText('first')).toBeInTheDocument();
    });

    it('resets the timer after manual navigation so the new image gets a full duration', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg'), makeImage('b.jpg')]}
                onComplete={onComplete}
            />,
        );

        // Advance partway through the first image then manually skip
        act(() => vi.advanceTimersByTime(DURATION / 2));
        fireEvent.click(screen.getByTestId('carousel-next'));

        // The second image should not complete before a full duration elapses
        act(() => vi.advanceTimersByTime(DURATION / 2));
        expect(onComplete).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(DURATION / 2 + TICK_MS));
        expect(onComplete).toHaveBeenCalledOnce();
    });
});

describe('ImageCarousel — pause and sensitive media', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('does not advance when paused is true', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                paused={true}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION * 3);
        });

        expect(onComplete).not.toHaveBeenCalled();
    });

    it('still advances when blurMedia is true', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                blurMedia={true}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION + TICK_MS);
        });

        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('shows "Show sensitive media" button when blurMedia is true', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg', 'private photo')]}
                blurMedia={true}
            />,
        );

        expect(
            screen.getByRole('button', { name: /show sensitive media/i }),
        ).toBeInTheDocument();
    });

    it('does not show the reveal button when blurMedia is false', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                blurMedia={false}
            />,
        );

        expect(
            screen.queryByRole('button', { name: /show sensitive media/i }),
        ).not.toBeInTheDocument();
    });

    it('calls onRevealMedia when the reveal button is clicked', () => {
        const onRevealMedia = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                blurMedia={true}
                onRevealMedia={onRevealMedia}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: /show sensitive media/i }),
        );

        expect(onRevealMedia).toHaveBeenCalledOnce();
    });
});
