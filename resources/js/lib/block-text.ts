const MAX_TOTAL_LINES = 10;

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

    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        if (!current) {
            current = word;
        } else if (current.length + 1 + word.length <= targetChars) {
            current += ` ${word}`;
        } else {
            lines.push(current);
            current = word;
        }
    }

    if (current) {
        lines.push(current);
    }

    return lines;
}

export function splitIntoLinesWithBoundaries(text: string): {
    lines: string[];
    paragraphStarts: Set<number>;
} {
    const paragraphs = text.split('\n').filter(Boolean);

    if (paragraphs.length === 0) {
        return { lines: [], paragraphStarts: new Set() };
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
