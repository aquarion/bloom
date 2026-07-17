import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAutoFitText } from './useAutoFitText';

function Harness({ body }: { body: string }) {
    const { containerRef, lineRefs, lines, lineKeys } = useAutoFitText(body);

    return (
        <div ref={containerRef}>
            {lines.map((line, idx) => (
                <span
                    key={lineKeys[idx]}
                    ref={(el) => {
                        lineRefs.current[idx] = el;
                    }}
                    data-testid="line"
                >
                    {line}
                </span>
            ))}
        </div>
    );
}

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
});
