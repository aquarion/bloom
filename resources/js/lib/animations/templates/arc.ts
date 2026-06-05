import type { AnimationTemplate } from '../types';

export const arc: AnimationTemplate = (tl, words) => {
    if (words.length === 0) {
        return;
    }

    const longest = [...words].reduce((a, b) =>
        (a.textContent?.length ?? 0) >= (b.textContent?.length ?? 0) ? a : b,
    );
    const others = words.filter((w) => w !== longest);

    others.forEach((word, i) => {
        const angle = (i / others.length) * Math.PI * 2;
        const dx = Math.cos(angle) * 120;
        const dy = Math.sin(angle) * 80;
        tl.set(word, { opacity: 0, x: dx, y: dy, scale: 0.5 }, 0).to(
            word,
            {
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                duration: 0.35,
                ease: 'power2.out',
            },
            i * 0.1,
        );
    });

    tl.set(longest, { opacity: 0, scale: 2.5, filter: 'blur(8px)' }, 0).to(
        longest,
        {
            opacity: 1,
            scale: 1,
            filter: 'blur(0px)',
            duration: 0.5,
            ease: 'power3.out',
        },
        others.length * 0.1 + 0.15,
    );
};
