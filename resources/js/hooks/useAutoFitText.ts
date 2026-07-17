import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { splitIntoLinesWithBoundaries } from '@/lib/block-text';

const BASE_FONT_SIZE = 40;
const LINE_HEIGHT = 1.1;

export function useAutoFitText(body: string) {
    const containerRef = useRef<HTMLDivElement>(null);
    // eslint-disable-next-line @eslint-react/naming-convention-ref-name
    const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
    // Tracks which body the font sizes were computed for so they naturally
    // become null when body changes without needing setState inside an effect.
    const [fontSizeState, setFontSizeState] = useState<{
        body: string;
        sizes: number[];
    } | null>(null);

    const { lines, paragraphStarts } = useMemo(
        () =>
            body
                ? splitIntoLinesWithBoundaries(body)
                : { lines: [] as string[], paragraphStarts: new Set<number>() },
        [body],
    );

    // Pre-compute a unique key per line using sequential character offsets so
    // identical lines in different positions still get distinct keys.
    const lineKeys = useMemo(() => {
        const keys: number[] = [];
        let search = 0;

        for (const line of lines) {
            const pos = body.indexOf(line, search);
            const key = pos >= 0 ? pos : search;
            keys.push(key);
            search = key + line.length;
        }

        return keys;
    }, [lines, body]);

    // Font sizes are only valid for the current body; treat as null when body changes.
    const fontSizes = fontSizeState?.body === body ? fontSizeState.sizes : null;

    // Measure rendered line widths after DOM settle to compute per-line font sizes
    useLayoutEffect(() => {
        if (lines.length === 0 || !containerRef.current) {
            return;
        }

        const els = lineRefs.current.slice(0, lines.length);

        if (els.some((el) => !el)) {
            return;
        }

        const { width, height } = containerRef.current.getBoundingClientRect();
        const targetWidth = width * 0.9;

        const widths = els.map((el) => el?.getBoundingClientRect().width ?? 0);
        let sizes = widths.map((w) =>
            w > 0 ? BASE_FONT_SIZE * (targetWidth / w) : BASE_FONT_SIZE,
        );

        // For multi-paragraph posts, limit cross-paragraph size disparity while
        // preserving within-paragraph variation (each line still fills its width).
        // Strategy: find each paragraph's min size (its widest line = most constrained),
        // then scale down any paragraph whose min exceeds 2× the global paragraph min.
        if (paragraphStarts.size > 0) {
            const boundaries = [
                0,
                ...[...paragraphStarts].sort((a, b) => a - b),
                sizes.length,
            ];
            const paraMins = boundaries
                .slice(0, -1)
                .map((start, i) =>
                    Math.min(...sizes.slice(start, boundaries[i + 1])),
                );
            const globalMin = Math.min(...paraMins);
            sizes = sizes.map((s, lineIdx) => {
                const p = boundaries.findLastIndex((b) => lineIdx >= b);

                return s * Math.min(1, (globalMin * 2) / paraMins[p]);
            });
        }

        const gapHeight = [...paragraphStarts].reduce(
            (sum, idx) => sum + (sizes[idx] ?? 0) * 0.5,
            0,
        );
        const totalHeight =
            sizes.reduce((sum, s) => sum + s * LINE_HEIGHT, 0) + gapHeight;
        const heightBudget = height * 0.45;

        if (totalHeight > heightBudget) {
            const scale = heightBudget / totalHeight;
            sizes = sizes.map((s) => s * scale);
        }

        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setFontSizeState({ body, sizes });
    }, [lines, body, paragraphStarts]);

    return {
        containerRef,
        lineRefs,
        lines,
        lineKeys,
        paragraphStarts,
        fontSizes,
    };
}
