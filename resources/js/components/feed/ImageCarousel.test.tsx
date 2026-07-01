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

describe('ImageCarousel — multiple images', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('renders one progress bar per image', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg'),
                    makeImage('b.jpg'),
                    makeImage('c.jpg'),
                ]}
            />,
        );
        expect(screen.getAllByRole('progressbar')).toHaveLength(3);
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
        expect(screen.queryByAltText('second')).not.toBeInTheDocument();
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

        expect(screen.queryByAltText('first')).not.toBeInTheDocument();
        expect(screen.getByAltText('second')).toBeInTheDocument();
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

        expect(screen.queryByAltText('first')).not.toBeInTheDocument();
        expect(screen.getByAltText('second')).toBeInTheDocument();
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
});
