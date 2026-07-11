import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Poll } from '@/types/post';
import { PollResults } from './PollResults';

const basePoll: Poll = {
    id: '1',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    expired: false,
    multiple: false,
    votes_count: 30,
    options: [
        { title: 'Vim', votes_count: 20 },
        { title: 'Emacs', votes_count: 10 },
    ],
    voted: false,
    own_votes: [],
};

describe('PollResults', () => {
    it('renders each option with its vote count and percentage', () => {
        render(
            <PollResults
                poll={basePoll}
                originalUrl="https://example.com/post/1"
            />,
        );

        expect(screen.getByText('Vim')).toBeInTheDocument();
        expect(screen.getByText(/20 votes/)).toBeInTheDocument();
        expect(screen.getByText(/67%/)).toBeInTheDocument();
        expect(screen.getByText('Emacs')).toBeInTheDocument();
        expect(screen.getByText(/10 votes/)).toBeInTheDocument();
        expect(screen.getByText(/33%/)).toBeInTheDocument();
    });

    it('shows total vote count', () => {
        render(
            <PollResults
                poll={basePoll}
                originalUrl="https://example.com/post/1"
            />,
        );

        expect(screen.getByText(/30 votes total/)).toBeInTheDocument();
    });

    it('shows "Poll closed" for an expired poll', () => {
        const expired: Poll = { ...basePoll, expired: true };
        render(
            <PollResults
                poll={expired}
                originalUrl="https://example.com/post/1"
            />,
        );

        expect(screen.getByText('Poll closed')).toBeInTheDocument();
    });

    it('does not show "Poll closed" for an open poll', () => {
        render(
            <PollResults
                poll={basePoll}
                originalUrl="https://example.com/post/1"
            />,
        );

        expect(screen.queryByText('Poll closed')).not.toBeInTheDocument();
    });

    it('shows a multiple-choice label when the poll allows multiple selections', () => {
        const multi: Poll = { ...basePoll, multiple: true };
        render(
            <PollResults
                poll={multi}
                originalUrl="https://example.com/post/1"
            />,
        );

        expect(screen.getByText(/multiple choice/i)).toBeInTheDocument();
    });

    it('highlights the option(s) the connected account voted for', () => {
        const voted: Poll = { ...basePoll, voted: true, own_votes: [0] };
        render(
            <PollResults
                poll={voted}
                originalUrl="https://example.com/post/1"
            />,
        );

        expect(screen.getByTestId('poll-option-0')).toHaveAttribute(
            'data-voted',
            'true',
        );
        expect(screen.getByTestId('poll-option-1')).toHaveAttribute(
            'data-voted',
            'false',
        );
    });

    it('renders a vote link pointing at the original post', () => {
        render(
            <PollResults
                poll={basePoll}
                originalUrl="https://example.com/post/1"
            />,
        );

        const link = screen.getByRole('link', { name: /vote/i });
        expect(link).toHaveAttribute('href', 'https://example.com/post/1');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
});
