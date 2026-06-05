import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { arc } from './templates/arc';
import { blockTilt } from './templates/blockTilt';
import { spiral } from './templates/spiral';
import { stackFlip } from './templates/stackFlip';
import type { AnimationTemplate } from './types';

gsap.registerPlugin(SplitText);

export const templates: AnimationTemplate[] = [
    blockTilt,
    spiral,
    stackFlip,
    arc,
];

export function pickTemplate(exclude?: AnimationTemplate): AnimationTemplate {
    const candidates = exclude
        ? templates.filter((t) => t !== exclude)
        : templates;

    return candidates[Math.floor(Math.random() * candidates.length)];
}

export type { AnimationTemplate };
export { SplitText };
