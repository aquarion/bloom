import type { AnimationTemplate } from '../types';

export const blockTilt: AnimationTemplate = (tl, words, container) => {
    tl.set(words, { opacity: 0, y: -16, scale: 0.8 })
        .to(words, {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.25,
            ease: 'power2.out',
            stagger: 0.12,
        })
        .to(container, {
            rotation: 6,
            duration: 0.8,
            ease: 'back.out(1.4)',
        });
};
