import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoFitText } from './useAutoFitText';

function Harness({ body }: { body: string }) {
    const { containerRef, lineRefs, lines, lineKeys, fontSizes } =
        useAutoFitText(body);

    return (
        <div ref={containerRef} data-testid="container">
            <span data-testid="font-sizes">{JSON.stringify(fontSizes)}</span>
            {lines.map((line, idx) => (
                <span
                    key={lineKeys[idx]}
                    ref={(el) => {
                        lineRefs.current[idx] = el;
                    }}
                    data-testid="line"
                    data-line-index={idx}
                >
                    {line}
                </span>
            ))}
        </div>
    );
}

/** Stubs getBoundingClientRect so the container reports `containerRect` and
 * each `[data-testid="line"]` reports the matching width from `lineWidths`. */
function mockMeasurements(
    containerRect: { width: number; height: number },
    lineWidths: number[],
) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
        function (this: Element) {
            const base = {
                x: 0,
                y: 0,
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                toJSON: () => ({}),
            };

            if (this.getAttribute('data-testid') === 'container') {
                return { ...base, ...containerRect } as DOMRect;
            }

            const idx = this.getAttribute('data-line-index');

            if (idx !== null) {
                return {
                    ...base,
                    width: lineWidths[Number(idx)] ?? 0,
                    height: 20,
                } as DOMRect;
            }

            return { ...base, width: 0, height: 0 } as DOMRect;
        },
    );
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useAutoFitText', () => {
    it('splits a multi-paragraph body into one line per element', () => {
        const { getAllByTestId } = render(<Harness body={'hello\nworld'} />);
        const lineEls = getAllByTestId('line');

        expect(lineEls).toHaveLength(2);
        expect(lineEls[0]).toHaveTextContent('hello');
        expect(lineEls[1]).toHaveTextContent('world');
    });

    it('returns no lines for an empty body', () => {
        const { queryAllByTestId } = render(<Harness body="" />);

        expect(queryAllByTestId('line')).toHaveLength(0);
    });

    it('clamps cross-paragraph font-size disparity to finite values', () => {
        mockMeasurements({ width: 1000, height: 1000 }, [100, 400]);

        const { getByTestId } = render(<Harness body={'hello\nworld'} />);
        const fontSizes = JSON.parse(
            getByTestId('font-sizes').textContent ?? 'null',
        );

        expect(fontSizes).toEqual([180, 90]);
        expect(fontSizes.every(Number.isFinite)).toBe(true);
    });

    it('does not commit font sizes when the container measures zero size', () => {
        mockMeasurements({ width: 0, height: 0 }, [100, 400]);

        const { getByTestId } = render(<Harness body={'hello\nworld'} />);

        expect(getByTestId('font-sizes')).toHaveTextContent('null');
    });
});
