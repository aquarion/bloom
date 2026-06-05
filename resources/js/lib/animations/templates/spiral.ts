import type { AnimationTemplate } from '../types';

export const spiral: AnimationTemplate = (tl, words) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const origins = [
        { x: -vw * 0.5, y: -vh * 0.4 },
        { x: vw * 0.5, y: -vh * 0.4 },
        { x: -vw * 0.5, y: vh * 0.4 },
        { x: vw * 0.5, y: vh * 0.4 },
        { x: 0, y: -vh * 0.5 },
        { x: 0, y: vh * 0.5 },
    ];

    words.forEach((word, i) => {
        const origin = origins[i % origins.length];
        tl.set(
            word,
            { opacity: 0, x: origin.x, y: origin.y, scale: 0.3 },
            0,
        ).to(
            word,
            {
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                duration: 0.4,
                ease: 'power3.out',
            },
            i * 0.15,
        );
    });
};
