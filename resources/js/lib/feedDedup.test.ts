import { describe, expect, it } from 'vitest';
import type { Post } from '@/types/post';
import { dedupePosts, normaliseBodyForDedup, similarTextPercent } from './feedDedup';

function makePost(overrides: Partial<Post> = {}): Post {
    return {
        id: '1',
        source: 'mastodon',
        source_handle: '',
        source_instance: null,
        author_name: 'Test',
        author_handle: '@test@example.com',
        author_avatar: '',
        author_banner: null,
        body: 'hello',
        media: [],
        created_at: new Date().toISOString(),
        original_url: 'https://example.com/1',
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
    };
}

describe('normaliseBodyForDedup', () => {
    it('lowercases, strips urls/hashtags/punctuation, and collapses whitespace', () => {
        expect(
            normaliseBodyForDedup(
                'Check THIS out! #BreakingNews https://example.com/story',
            ),
        ).toBe('check this out');
    });
});

describe('similarTextPercent', () => {
    it('matches PHP similar_text() percentages for representative pairs', () => {
        // Reference values generated with PHP's similar_text() for these exact pairs.
        expect(
            similarTextPercent(
                'hello world this is a test',
                'hello world this is another test',
            ),
        ).toBeCloseTo(89.655172, 5);
        expect(
            similarTextPercent(
                'the quick brown fox jumps over the lazy dog',
                'the quick brown fox leaps over the lazy dog',
            ),
        ).toBeCloseTo(93.023256, 5);
        expect(
            similarTextPercent(
                'completely different text here',
                'nothing alike at all whatsoever',
            ),
        ).toBeCloseTo(22.95082, 5);
        expect(similarTextPercent('short', 'short')).toBe(100);
        expect(similarTextPercent('', 'something')).toBe(0);
    });
});

describe('dedupePosts', () => {
    it('keeps the newest of two posts sharing the same original_url', () => {
        const older = makePost({
            id: '201',
            original_url: 'https://fosstodon.org/@charlie/123',
            boosted_by: 'Bob',
            created_at: '2024-01-01T00:00:00Z',
        });
        const newer = makePost({
            id: '200',
            original_url: 'https://fosstodon.org/@charlie/123',
            boosted_by: 'Alice',
            created_at: '2024-01-01T00:05:00Z',
        });

        const result = dedupePosts([older, newer]);

        expect(result).toHaveLength(1);
        expect(result[0].boosted_by).toBe('Alice');
    });

    it('deduplicates cross-account posts with similar body within 24h', () => {
        const body =
            'This is a cross-posted message about interesting things happening in the world today.';
        const now = new Date().toISOString();

        const mastodonPost = makePost({
            id: 'masto1',
            original_url: 'https://fosstodon.org/@alice/masto1',
            body,
            created_at: now,
        });
        const blueskyPost = makePost({
            id: 'bsky1',
            original_url: 'https://bsky.app/profile/alice.bsky.social/post/xyz',
            body,
            created_at: now,
        });

        expect(dedupePosts([mastodonPost, blueskyPost])).toHaveLength(1);
    });

    it('does not deduplicate similar posts more than 24h apart', () => {
        const body =
            'This is a cross-posted message about interesting things happening in the world today.';

        const mastodonPost = makePost({
            id: 'masto2',
            original_url: 'https://fosstodon.org/@alice/masto2',
            body,
            created_at: new Date().toISOString(),
        });
        const blueskyPost = makePost({
            id: 'bsky2',
            original_url: 'https://bsky.app/profile/alice.bsky.social/post/xyz2',
            body,
            created_at: new Date(
                Date.now() - 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
        });

        expect(dedupePosts([mastodonPost, blueskyPost])).toHaveLength(2);
    });

    it('sorts the merged result newest-first', () => {
        const older = makePost({
            id: '1',
            original_url: 'https://example.com/1',
            created_at: '2024-01-01T00:00:00Z',
        });
        const newer = makePost({
            id: '2',
            original_url: 'https://example.com/2',
            created_at: '2024-01-02T00:00:00Z',
        });

        expect(dedupePosts([older, newer]).map((p) => p.id)).toEqual([
            '2',
            '1',
        ]);
    });

    it('caps the result to the buffer size', () => {
        const posts = Array.from({ length: 250 }, (_, i) =>
            makePost({
                id: String(i),
                original_url: `https://example.com/${i}`,
                created_at: new Date(2024, 0, 1, 0, 0, i).toISOString(),
            }),
        );

        expect(dedupePosts(posts)).toHaveLength(200);
    });
});
