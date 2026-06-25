import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Mention } from '@/types/post';
import { MentionChips } from './MentionChips';

const makeMention = (handle: string): Mention => ({
    handle,
    display_name: handle.replace('@', ''),
    avatar: '',
    profile_url: `https://example.com/${handle}`,
});

it('renders a chip for each mention', () => {
    render(
        <MentionChips
            mentions={[makeMention('@alice'), makeMention('@bob')]}
        />,
    );
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
});

it('renders nothing when there are no mentions', () => {
    const { container } = render(<MentionChips mentions={[]} />);
    expect(container).toBeEmptyDOMElement();
});

it('links each chip to its profile_url in a new tab', () => {
    render(<MentionChips mentions={[makeMention('@alice')]} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/@alice');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('dedupes mentions sharing the same profile_url', () => {
    render(
        <MentionChips
            mentions={[
                makeMention('@alice'),
                makeMention('@alice'),
                makeMention('@bob'),
            ]}
        />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
});
