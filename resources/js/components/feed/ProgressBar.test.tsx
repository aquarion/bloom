import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar — linear mode', () => {
    it('renders a bar at the given progress fraction', () => {
        const { container } = render(<ProgressBar progress={0.5} />);
        const bar = container.querySelector('.bg-white\\/60') as HTMLElement;
        expect(bar.style.transform).toBe('scaleX(0.5)');
    });

    it('defaults to full width when progress is 1', () => {
        const { container } = render(<ProgressBar progress={1} />);
        const bar = container.querySelector('.bg-white\\/60') as HTMLElement;
        expect(bar.style.transform).toBe('scaleX(1)');
    });
});

describe('ProgressBar — segments mode', () => {
    it('renders the correct number of segment tracks', () => {
        const { container } = render(
            <ProgressBar segments={{ count: 3, activeIndex: 0, elapsed: 0 }} />,
        );
        const tracks = container.querySelectorAll('.flex-1');
        expect(tracks).toHaveLength(3);
    });

    it('completed segments show 0% width', () => {
        const { container } = render(
            <ProgressBar
                segments={{ count: 3, activeIndex: 2, elapsed: 0.5 }}
            />,
        );
        const bars = container.querySelectorAll<HTMLElement>('.bg-white\\/60');
        expect(bars[0].style.transform).toBe('scaleX(0)');
        expect(bars[1].style.transform).toBe('scaleX(0)');
    });

    it('active segment shows countdown width: (1 - elapsed) * 100%', () => {
        const { container } = render(
            <ProgressBar
                segments={{ count: 3, activeIndex: 1, elapsed: 0.4 }}
            />,
        );
        const bars = container.querySelectorAll<HTMLElement>('.bg-white\\/60');
        expect(bars[1].style.transform).toBe('scaleX(0.6)');
    });

    it('future segments show 100% width', () => {
        const { container } = render(
            <ProgressBar
                segments={{ count: 3, activeIndex: 0, elapsed: 0.5 }}
            />,
        );
        const bars = container.querySelectorAll<HTMLElement>('.bg-white\\/60');
        expect(bars[1].style.transform).toBe('scaleX(1)');
        expect(bars[2].style.transform).toBe('scaleX(1)');
    });

    it('first segment at elapsed=0 shows full width (nothing elapsed)', () => {
        const { container } = render(
            <ProgressBar segments={{ count: 2, activeIndex: 0, elapsed: 0 }} />,
        );
        const bars = container.querySelectorAll<HTMLElement>('.bg-white\\/60');
        expect(bars[0].style.transform).toBe('scaleX(1)');
    });

    it('first segment at elapsed=1 shows 0% (fully elapsed)', () => {
        const { container } = render(
            <ProgressBar segments={{ count: 2, activeIndex: 0, elapsed: 1 }} />,
        );
        const bars = container.querySelectorAll<HTMLElement>('.bg-white\\/60');
        expect(bars[0].style.transform).toBe('scaleX(0)');
    });
});
