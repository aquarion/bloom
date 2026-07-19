import { describe, expect, it } from 'vitest';
import { isCwLabelVisible, nestedCwLike, shouldShowCwOverlay } from './cw';

describe('nestedCwLike', () => {
    it('uses original_url as the id when present', () => {
        const like = nestedCwLike({
            original_url: 'https://bsky.app/profile/bob.bsky.social/post/1',
            author_handle: '@bob.bsky.social',
            cw_text: 'Adult content',
            cw_is_author_level: false,
            sensitive_media: true,
        });

        expect(like.id).toBe('https://bsky.app/profile/bob.bsky.social/post/1');
    });

    it('falls back to author_handle + cw_text when original_url is empty', () => {
        const like = nestedCwLike({
            original_url: '',
            author_handle: '@bob.bsky.social',
            cw_text: 'Adult content',
            cw_is_author_level: false,
            sensitive_media: false,
        });

        expect(like.id).toBe('@bob.bsky.social:Adult content');
    });

    it('gives two different unsafe-url nested posts from different authors distinct fallback ids', () => {
        const alice = nestedCwLike({
            original_url: '',
            author_handle: '@alice.bsky.social',
            cw_text: 'Graphic media',
            cw_is_author_level: false,
            sensitive_media: false,
        });
        const bob = nestedCwLike({
            original_url: '',
            author_handle: '@bob.bsky.social',
            cw_text: 'Graphic media',
            cw_is_author_level: false,
            sensitive_media: false,
        });

        expect(alice.id).not.toBe(bob.id);
    });

    it('never sets source, so the Bluesky media-redundancy exception can never apply to it', () => {
        const like = nestedCwLike({
            original_url: 'https://bsky.app/profile/bob.bsky.social/post/1',
            author_handle: '@bob.bsky.social',
            cw_text: 'Adult content',
            cw_is_author_level: false,
            sensitive_media: true,
        });

        expect(like.source).toBeUndefined();
    });
});

describe('shouldShowCwOverlay', () => {
    const isRevealed = () => false;

    it('shows the overlay when cw_text is set and cwBehavior is blur', () => {
        expect(
            shouldShowCwOverlay(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                    sensitive_media: false,
                },
                'blur',
                'show',
                isRevealed,
            ),
        ).toBe(true);
    });

    it('does not show the overlay when cwBehavior is show', () => {
        expect(
            shouldShowCwOverlay(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                    sensitive_media: false,
                },
                'show',
                'show',
                isRevealed,
            ),
        ).toBe(false);
    });

    it('does not show the overlay once revealed', () => {
        expect(
            shouldShowCwOverlay(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                    sensitive_media: false,
                },
                'blur',
                'show',
                () => true,
            ),
        ).toBe(false);
    });

    it('skips the overlay for a top-level Bluesky post whose sensitive media is already blurred', () => {
        expect(
            shouldShowCwOverlay(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                    sensitive_media: true,
                    source: 'bluesky',
                },
                'blur',
                'blur',
                isRevealed,
            ),
        ).toBe(false);
    });

    it('does not skip the overlay for a nested post-like object with sensitive_media but no source', () => {
        const nested = nestedCwLike({
            original_url: 'https://bsky.app/profile/bob.bsky.social/post/1',
            author_handle: '@bob.bsky.social',
            cw_text: 'Adult content',
            cw_is_author_level: false,
            sensitive_media: true,
        });

        expect(shouldShowCwOverlay(nested, 'blur', 'blur', isRevealed)).toBe(
            true,
        );
    });

    it('still shows the overlay for a top-level Mastodon post with sensitive media (no redundancy exception)', () => {
        expect(
            shouldShowCwOverlay(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'CW: spoilers',
                    cw_is_author_level: false,
                    sensitive_media: true,
                    source: 'mastodon',
                },
                'blur',
                'blur',
                isRevealed,
            ),
        ).toBe(true);
    });
});

describe('isCwLabelVisible', () => {
    it('is visible immediately when cwBehavior is show', () => {
        expect(
            isCwLabelVisible(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                    sensitive_media: false,
                },
                'show',
                () => false,
            ),
        ).toBe(true);
    });

    it('is hidden when cwBehavior is blur and unrevealed', () => {
        expect(
            isCwLabelVisible(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                    sensitive_media: false,
                },
                'blur',
                () => false,
            ),
        ).toBe(false);
    });

    it('is visible when cwBehavior is blur and revealed', () => {
        expect(
            isCwLabelVisible(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: 'Adult content',
                    cw_is_author_level: false,
                    sensitive_media: false,
                },
                'blur',
                () => true,
            ),
        ).toBe(true);
    });

    it('is never visible when cw_text is null', () => {
        expect(
            isCwLabelVisible(
                {
                    id: 'p1',
                    author_handle: '@alice',
                    cw_text: null,
                    cw_is_author_level: false,
                    sensitive_media: false,
                },
                'show',
                () => true,
            ),
        ).toBe(false);
    });
});
