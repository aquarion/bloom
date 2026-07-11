import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

const basePost: Post = {
    id: 'p1',
    source: 'mastodon',
    source_handle: null,
    source_instance: 'mastodon.example',
    author_name: 'Test User',
    author_handle: '@user@mastodon.example',
    author_avatar: '',
    author_banner: null,
    body: '',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://mastodon.example/@user/1',
    link_url: null,
    link_title: null,
    link_favicon: null,
    reply_to: null,
    quoted_post: null,
    boosted_by: null,
    boosted_by_avatar: null,
    boosted_by_handle: null,
    boosted_by_created_at: null,
    emojis: {},
    hashtags: [],
    chip_mentions: [],
    cw_text: null,
    cw_is_author_level: false,
    cw_label_source: null,
    sensitive_media: false,
};

const poll = {
    id: '1',
    expires_at: null,
    expired: false,
    multiple: false,
    votes_count: 10,
    options: [
        { title: 'Yes', votes_count: 7 },
        { title: 'No', votes_count: 3 },
    ],
    voted: false,
    own_votes: [],
};

describe('PostAnimator — poll rendering', () => {
    it('renders poll results for a poll-only post (no body, no media)', () => {
        render(<PostAnimator post={{ ...basePost, poll }} colors={null} />);

        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('renders poll results alongside body text', () => {
        render(
            <PostAnimator
                post={{ ...basePost, body: 'What do you think?', poll }}
                colors={null}
            />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders poll results on an image post', () => {
        render(
            <PostAnimator
                post={{
                    ...basePost,
                    media: [
                        {
                            type: 'image',
                            url: 'https://example.com/a.jpg',
                            preview_url: null,
                            alt_text: 'a photo',
                        },
                    ],
                    poll,
                }}
                colors={null}
                onRevealMedia={vi.fn()}
            />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders nothing but does not crash for a post with no body, no media, and no poll', () => {
        const { container } = render(
            <PostAnimator post={basePost} colors={null} />,
        );

        expect(container.firstChild).toBeNull();
    });
});
