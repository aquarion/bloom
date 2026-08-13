import { describe, expect, it } from 'vitest';
import { computeParagraphHighlights } from './paragraph-highlight';

function makeWord(text: string): HTMLElement {
    const el = document.createElement('span');
    el.textContent = text;

    return el;
}

/** Builds a line element containing the given words, appended in order. */
function makeLine(words: HTMLElement[]): HTMLElement {
    const line = document.createElement('div');

    for (const word of words) {
        line.appendChild(word);
    }

    return line;
}

describe('computeParagraphHighlights', () => {
    it('treats the whole post as one paragraph when there are no paragraph starts', () => {
        const words = ['a', 'short', 'extraordinary', 'day'].map(makeWord);
        const line = makeLine(words);

        const { groups, highlights } = computeParagraphHighlights({
            words,
            lineEls: [line],
            paragraphStarts: new Set(),
        });

        expect(groups).toHaveLength(1);
        expect(groups[0]).toEqual(words);
        expect(highlights).toHaveLength(1);
        expect(highlights[0]?.textContent).toBe('extraordinary');
    });

    it('splits words into per-paragraph groups and picks a highlight per paragraph', () => {
        const p1Words = ['the', 'wonderful', 'fox'].map(makeWord);
        const p2Words = ['a', 'spectacular', 'jump'].map(makeWord);
        const line1 = makeLine(p1Words);
        const line2 = makeLine(p2Words);

        const { groups, highlights } = computeParagraphHighlights({
            words: [...p1Words, ...p2Words],
            lineEls: [line1, line2],
            paragraphStarts: new Set([1]),
        });

        expect(groups).toHaveLength(2);
        expect(groups[0]).toEqual(p1Words);
        expect(groups[1]).toEqual(p2Words);
        expect(highlights[0]?.textContent).toBe('wonderful');
        expect(highlights[1]?.textContent).toBe('spectacular');
    });

    it('groups multiple lines belonging to the same paragraph together', () => {
        const line1Words = ['brief', 'intro'].map(makeWord);
        const line2Words = ['continuing', 'the', 'thought'].map(makeWord);
        const line3Words = ['second', 'paragraph', 'entirely'].map(makeWord);
        const line1 = makeLine(line1Words);
        const line2 = makeLine(line2Words);
        const line3 = makeLine(line3Words);

        const { groups, highlights } = computeParagraphHighlights({
            words: [...line1Words, ...line2Words, ...line3Words],
            lineEls: [line1, line2, line3],
            paragraphStarts: new Set([2]),
        });

        expect(groups).toHaveLength(2);
        expect(groups[0]).toEqual([...line1Words, ...line2Words]);
        expect(groups[1]).toEqual(line3Words);
        expect(highlights[0]?.textContent).toBe('continuing');
        expect(highlights[1]?.textContent).toBe('paragraph');
    });

    it('excludes @mentions and #hashtags from being picked as the highlight', () => {
        const words = ['@averylongmention', '#superlonghashtag', 'hi'].map(
            makeWord,
        );
        const line = makeLine(words);

        const { highlights } = computeParagraphHighlights({
            words,
            lineEls: [line],
            paragraphStarts: new Set(),
        });

        expect(highlights[0]?.textContent).toBe('hi');
    });

    it('falls back to the full paragraph when every word is a mention or hashtag', () => {
        const words = ['#longesthashtag', '@mention'].map(makeWord);
        const line = makeLine(words);

        const { highlights } = computeParagraphHighlights({
            words,
            lineEls: [line],
            paragraphStarts: new Set(),
        });

        expect(highlights[0]?.textContent).toBe('#longesthashtag');
    });

    it('returns an empty result for an empty word list', () => {
        const { groups, highlights } = computeParagraphHighlights({
            words: [],
            lineEls: [],
            paragraphStarts: new Set(),
        });

        expect(groups).toEqual([[]]);
        expect(highlights).toEqual([null]);
    });
});
