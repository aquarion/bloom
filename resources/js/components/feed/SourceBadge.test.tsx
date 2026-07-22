import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Post } from '@/types/post';
import { SourceBadge } from './SourceBadge';

const makePost = (overrides: Partial<Post> = {}): Post => ({
    id: 'p1',
    source: 'mastodon',
    source_handle: '@alice@mastodon.social',
    source_instance: 'mastodon.social',
    author_name: 'Alice',
    author_handle: '@alice@mastodon.social',
    author_avatar: '',
    author_banner: null,
    body: 'hello',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://mastodon.social/@alice/1',
    link_url: null,
    link_title: null,
    link_description: null,
    link_image: null,
    link_favicon: null,
    link_youtube_id: null,
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
    cw_category: null,
    sensitive_media: false,
    ...overrides,
});

describe('SourceBadge', () => {
    it('shows the account handle for a home-feed post', () => {
        render(<SourceBadge post={makePost({ feed_type: 'home' })} />);

        expect(screen.getByText('@alice@mastodon.social')).toBeInTheDocument();
    });

    it('shows the account handle when feed_type is absent (older payloads)', () => {
        render(<SourceBadge post={makePost()} />);

        expect(screen.getByText('@alice@mastodon.social')).toBeInTheDocument();
    });

    it('shows "Provider — Feed Name" for a public Mastodon timeline post', () => {
        render(
            <SourceBadge
                post={makePost({
                    feed_type: 'public_mastodon',
                    feed_name: 'mastodon.social',
                })}
            />,
        );

        expect(
            screen.getByText('Mastodon — mastodon.social'),
        ).toBeInTheDocument();
    });

    it('shows "Provider — Feed Name" for a Bluesky algorithmic feed post', () => {
        render(
            <SourceBadge
                post={makePost({
                    source: 'bluesky',
                    feed_type: 'bluesky_feed',
                    feed_name: 'Whats Hot',
                })}
            />,
        );

        expect(screen.getByText('Bluesky — Whats Hot')).toBeInTheDocument();
    });

    it('falls back to just the provider name when a public feed has no feed_name', () => {
        render(
            <SourceBadge
                post={makePost({
                    feed_type: 'bluesky_feed',
                    feed_name: null,
                })}
            />,
        );

        expect(screen.getByText('Mastodon')).toBeInTheDocument();
    });
});
