import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VersionBanner } from './VersionBanner';

describe('VersionBanner', () => {
    it('renders a plain label when there is no url', () => {
        render(<VersionBanner appVersion={{ label: 'v1.11.2', url: null }} />);

        const label = screen.getByText('v1.11.2');
        expect(label.tagName).toBe('SPAN');
    });

    it('renders a link when a url is present', () => {
        render(
            <VersionBanner
                appVersion={{
                    label: 'feature/foo',
                    url: 'https://github.com/aquarion/bloom/pull/1',
                }}
            />,
        );

        const link = screen.getByRole('link', { name: 'feature/foo' });
        expect(link).toHaveAttribute(
            'href',
            'https://github.com/aquarion/bloom/pull/1',
        );
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
});
