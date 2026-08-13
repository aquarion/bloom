export interface ParagraphHighlightInput {
    /** Word elements in document order, as produced by SplitText. */
    words: Element[];
    /** One entry per line, the element wrapping that line's words. */
    lineEls: (Element | null)[];
    /** Line indices where a new paragraph begins (matches lineEls indices). */
    paragraphStarts: Set<number>;
}

export interface ParagraphHighlightResult {
    /** Word elements grouped by paragraph, in paragraph order. */
    groups: Element[][];
    /** The highlight (focal) word for each paragraph; null for an empty paragraph. */
    highlights: (Element | null)[];
}

/**
 * Groups a post's split words by paragraph and picks a highlight word for
 * each paragraph — the longest content word, skipping @mentions and
 * #hashtags so a long handle doesn't get picked over a real word. Falls
 * back to the full paragraph when every word is a mention/hashtag.
 */
export function computeParagraphHighlights({
    words,
    lineEls,
    paragraphStarts,
}: ParagraphHighlightInput): ParagraphHighlightResult {
    const lineOfWord = mapWordsToLines(words, lineEls);
    const lineParagraph = paragraphIndexPerLine(lineEls.length, paragraphStarts);

    const numParagraphs = paragraphStarts.size + 1;
    const groups: Element[][] = Array.from({ length: numParagraphs }, () => []);

    words.forEach((word, i) => {
        const paragraph = lineParagraph[lineOfWord[i]] ?? 0;
        groups[paragraph]?.push(word);
    });

    const highlights = groups.map(pickHighlightWord);

    return { groups, highlights };
}

/** Maps each word to the index of the line element that contains it. */
function mapWordsToLines(
    words: Element[],
    lineEls: (Element | null)[],
): number[] {
    const result: number[] = [];
    let lineIdx = 0;

    for (const word of words) {
        while (
            lineIdx < lineEls.length - 1 &&
            !lineEls[lineIdx]?.contains(word)
        ) {
            lineIdx++;
        }

        result.push(lineIdx);
    }

    return result;
}

/** Maps each line index to the index of the paragraph it belongs to. */
function paragraphIndexPerLine(
    numLines: number,
    paragraphStarts: Set<number>,
): number[] {
    const sortedStarts = [...paragraphStarts].sort((a, b) => a - b);
    const result: number[] = [];
    let idx = 0;

    for (let line = 0; line < numLines; line++) {
        while (idx < sortedStarts.length && sortedStarts[idx] <= line) {
            idx++;
        }

        result.push(idx);
    }

    return result;
}

function pickHighlightWord(group: Element[]): Element | null {
    if (group.length === 0) {
        return null;
    }

    const contentWords = group.filter(
        (w) => !/^[@#]/.test(w.textContent ?? ''),
    );
    const wordPool = contentWords.length > 0 ? contentWords : group;

    return wordPool.reduce((a, b) =>
        (a.textContent?.length ?? 0) >= (b.textContent?.length ?? 0) ? a : b,
    );
}
