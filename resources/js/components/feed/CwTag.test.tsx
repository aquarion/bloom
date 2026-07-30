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

    it('renders without the warning icon in vertical mode, matching hashtag pills', () => {
        render(<CwTag label="Spoilers" vertical />);

        const tag = screen.getByTestId('post-cw-tag');
        expect(tag).toHaveTextContent('CW: Spoilers');
        expect(tag.querySelector('svg')).not.toBeInTheDocument();
        expect(tag).toHaveStyle({ writingMode: 'vertical-rl' });
    });

    it('shows the warning icon by default (horizontal mode)', () => {
        render(<CwTag label="Spoilers" />);

        expect(
            screen.getByTestId('post-cw-tag').querySelector('svg'),
        ).toBeInTheDocument();
    });
});
