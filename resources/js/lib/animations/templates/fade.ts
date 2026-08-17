import type { AnimationTemplate } from '../types';

/** Reduced-motion counterpart to the other templates — a plain opacity fade,
 * no per-word stagger, rotation, or scale. */
export const fade: AnimationTemplate = (tl, words) => {
    tl.set(words, { opacity: 0 }).to(words, {
        opacity: 1,
        duration: 0.3,
        ease: 'power1.out',
    });
};
