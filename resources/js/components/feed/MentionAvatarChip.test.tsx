import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Mention } from '@/types/post';
import { MentionAvatarChip } from './MentionAvatarChip';

const mention: Mention = {
    handle: '@alice',
    display_name: 'Alice',
    avatar: 'https://example.com/avatar.jpg',
    profile_url: 'https://example.com/@alice',
};

it('renders the avatar image behind a profile link with a name tooltip', () => {
    render(<MentionAvatarChip mention={mention} />);

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/@alice');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('title', 'Alice');

    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
    expect(img).toHaveAttribute('alt', 'Alice');
});

it('falls back to the bloom placeholder when avatar is empty', () => {
    render(<MentionAvatarChip mention={{ ...mention, avatar: '' }} />);

    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('bloom-standard');
});
