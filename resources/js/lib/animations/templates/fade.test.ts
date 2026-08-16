import { expect, it, vi } from 'vitest';
import { fade } from './fade';

function makeWords(texts: string[]) {
    return texts.map((t) => ({ textContent: t }));
}

function makeTl() {
    const tl = { set: vi.fn(), to: vi.fn() };
    tl.set.mockReturnValue(tl);
    tl.to.mockReturnValue(tl);

    return tl;
}

it('sets words to opacity 0 then tweens them to opacity 1, with no rotation or scale', () => {
    const tl = makeTl();
    const words = makeWords(['hello', 'world']);

    // biome-ignore lint/suspicious/noExplicitAny: test harness requires any types
    fade(tl as any, words as any, null as any);

    expect(tl.set).toHaveBeenCalledWith(words, { opacity: 0 });
    expect(tl.to).toHaveBeenCalledWith(
        words,
        expect.objectContaining({ opacity: 1 }),
    );

    const toArgs = tl.to.mock.calls[0][1];
    expect(toArgs).not.toHaveProperty('scale');
    expect(toArgs).not.toHaveProperty('rotation');
});
