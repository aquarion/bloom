import type { AnimationTemplate } from '../types';

export const stackFlip: AnimationTemplate = (tl, words, container) => {
    tl.set(words, { opacity: 0, x: -24 })
        .to(words, {
            opacity: 1,
            x: 0,
            duration: 0.3,
            ease: 'power2.out',
            stagger: 0.18,
        })
        .to(container, {
            rotationY: 360,
            duration: 1.0,
            ease: 'power2.inOut',
            transformOrigin: '50% 50%',
        });
};
