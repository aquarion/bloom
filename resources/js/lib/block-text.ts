const MAX_TOTAL_LINES = 10;
const MIN_LINE_LENGTH = 5;

function balanceParagraph(
    text: string,
    minLines: number,
    maxLines: number,
): string[] {
    const words = text.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
        return [];
    }

    const numLines = Math.min(
        maxLines,
        Math.max(minLines, Math.ceil(words.length / 4)),
    );
    const targetChars = Math.ceil(text.length / numLines);

    const raw: string[] = [];
    let current = '';

    for (const word of words) {
        if (!current) {
            current = word;
        } else if (current.length + 1 + word.length <= targetChars) {
            current += ` ${word}`;
        } else {
            raw.push(current);
            current = word;
        }
    }

    if (current) {
        raw.push(current);
    }

    // Merge lines shorter than MIN_LINE_LENGTH into the previous line.
    // If the merge would make the line too long, split it evenly at the midpoint.
    const lines: string[] = [];

    for (const line of raw) {
        if (line.length < MIN_LINE_LENGTH && lines.length > 0) {
            const merged = `${lines[lines.length - 1]} ${line}`;

            if (merged.length > targetChars * 1.5) {
                const mergedWords = merged.split(' ');
                const mid = Math.ceil(mergedWords.length / 2);
                lines[lines.length - 1] = mergedWords.slice(0, mid).join(' ');
                lines.push(mergedWords.slice(mid).join(' '));
            } else {
                lines[lines.length - 1] = merged;
            }
        } else {
            lines.push(line);
        }
    }

    return lines;
}

export function splitIntoLinesWithBoundaries(text: string): {
    lines: string[];
    paragraphStarts: Set<number>;
} {
    let paragraphs = text.split('\n').filter(Boolean);

    if (paragraphs.length === 0) {
        return { lines: [], paragraphStarts: new Set() };
    }

    // Single-paragraph posts are split on ". " so each sentence becomes its
    // own visual unit, giving the balancer more structure to work with.
    // ". " (not just ".") avoids triggering on ellipsis like "...".
    if (paragraphs.length === 1) {
        const sentences = paragraphs[0]
            .replace(/\. /g, '.\n')
            .split('\n')
            .filter(Boolean);

        if (sentences.length > 1) {
            paragraphs = sentences;
        }
    }

    // Single-paragraph posts keep the minimum-2-lines visual balance.
    // Multi-paragraph posts allow 1 line per paragraph so short paragraphs
    // don't force excess lines that make the block tall and thin.
    const minLines = paragraphs.length === 1 ? 2 : 1;

    // Natural line count each paragraph would use without any total cap.
    const naturalCounts = paragraphs.map((p) => {
        const words = p.split(/\s+/).filter(Boolean);

        return Math.min(8, Math.max(minLines, Math.ceil(words.length / 4)));
    });
    const naturalTotal = naturalCounts.reduce((a, b) => a + b, 0);

    // If paragraphs together exceed the cap, scale each one down using the
    // Largest Remainder Method so sum(maxCounts) == MAX_TOTAL_LINES exactly.
    let maxCounts: number[];

    if (naturalTotal <= MAX_TOTAL_LINES) {
        maxCounts = naturalCounts;
    } else {
        const raw = naturalCounts.map(
            (n) => (n * MAX_TOTAL_LINES) / naturalTotal,
        );
        const floors = raw.map((r) => Math.floor(r));
        let remainder = MAX_TOTAL_LINES - floors.reduce((a, b) => a + b, 0);
        const order = raw
            .map((r, i): [number, number] => [r - Math.floor(r), i])
            .sort(([a], [b]) => b - a);

        for (const [, i] of order) {
            if (remainder-- <= 0) {
                break;
            }

            floors[i]++;
        }

        maxCounts = floors.map((f) => Math.max(1, f));
    }

    const lines: string[] = [];

    const paragraphStarts = new Set<number>();

    for (let i = 0; i < paragraphs.length; i++) {
        if (i > 0) {
            paragraphStarts.add(lines.length);
        }

        lines.push(...balanceParagraph(paragraphs[i], minLines, maxCounts[i]));
    }

    return { lines, paragraphStarts };
}

export function splitIntoLines(text: string): string[] {
    return splitIntoLinesWithBoundaries(text).lines;
}
