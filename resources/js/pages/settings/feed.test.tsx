import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FeedPreferences } from '@/types/preferences';
import FeedSettings from './feed';

let mockErrors: Record<string, string> = {};

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    useForm: (initial: Record<string, unknown>) => ({
        data: initial,
        setData: vi.fn(),
        put: vi.fn(),
        processing: false,
        errors: mockErrors,
    }),
}));

const preferences: FeedPreferences = {
    max_age_days: 7,
    mute_words: [],
    cw_behavior: 'blur',
    sensitive_media_behavior: 'blur',
    cw_label_whitelist: [],
};

describe('FeedSettings — cw_label_whitelist error rendering', () => {
    it('shows the message for an indexed cw_label_whitelist.N validation error', () => {
        mockErrors = {
            'cw_label_whitelist.0':
                'The selected cw label whitelist.0 is invalid.',
        };

        render(<FeedSettings preferences={preferences} />);

        expect(
            screen.getByText('The selected cw label whitelist.0 is invalid.'),
        ).toBeInTheDocument();
    });

    it('shows the message for a bare cw_label_whitelist validation error', () => {
        mockErrors = {
            cw_label_whitelist: 'The cw label whitelist field is invalid.',
        };

        render(<FeedSettings preferences={preferences} />);

        expect(
            screen.getByText('The cw label whitelist field is invalid.'),
        ).toBeInTheDocument();
    });

    it('renders no error message when cw_label_whitelist is valid', () => {
        mockErrors = {};

        render(<FeedSettings preferences={preferences} />);

        expect(
            screen.queryByText(/cw label whitelist/i),
        ).not.toBeInTheDocument();
    });
});
