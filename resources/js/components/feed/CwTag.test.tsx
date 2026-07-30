import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CwTag } from './CwTag';

describe('CwTag', () => {
    it('renders the CW-prefixed label', () => {
        render(<CwTag label="Spoilers" />);

        expect(screen.getByTestId('post-cw-tag')).toHaveTextContent(
            'CW: Spoilers',
        );
    });

    it('applies the given className for positioning', () => {
        render(
            <CwTag label="Spoilers" className="absolute right-2 bottom-2" />,
        );

        expect(screen.getByTestId('post-cw-tag').className).toContain(
            'absolute right-2 bottom-2',
        );
    });
});
