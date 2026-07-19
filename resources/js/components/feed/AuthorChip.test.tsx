import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthorChip } from './AuthorChip';

describe('AuthorChip — persistent CW indicator', () => {
    it('shows a warning marker with the label when cwLabel is set', () => {
        render(
            <AuthorChip
                name="Alice"
                avatar=""
                emojis={{}}
                account="@alice.bsky.social"
                cwLabel="Adult content"
            />,
        );

        expect(screen.getByText(/⚠️ Adult content/)).toBeInTheDocument();
    });

    it('does not show a warning marker when cwLabel is null', () => {
        render(
            <AuthorChip
                name="Alice"
                avatar=""
                emojis={{}}
                account="@alice.bsky.social"
                cwLabel={null}
            />,
        );

        expect(screen.queryByText(/⚠️/)).not.toBeInTheDocument();
    });

    it('does not show a warning marker when cwLabel is omitted', () => {
        render(
            <AuthorChip
                name="Alice"
                avatar=""
                emojis={{}}
                account="@alice.bsky.social"
            />,
        );

        expect(screen.queryByText(/⚠️/)).not.toBeInTheDocument();
    });
});
