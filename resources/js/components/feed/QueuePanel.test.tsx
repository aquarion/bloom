import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { QueuePanel } from './QueuePanel';

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

describe('QueuePanel', () => {
    it('is available to everyone (button always renders regardless of debugEnabled)', () => {
        render(
            <QueuePanel
                current={makePost()}
                queue={[]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        expect(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        ).toBeInTheDocument();
    });

    it('opens the panel on click and lists current + queued posts', async () => {
        const user = userEvent.setup();
        render(
            <QueuePanel
                current={makePost({ id: 'p1', author_name: 'Alice' })}
                queue={[makePost({ id: 'p2', author_name: 'Bob' })]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        expect(screen.getByText('Up next · 2 posts')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('marks the current post with NOW', async () => {
        const user = userEvent.setup();
        render(
            <QueuePanel
                current={makePost({ id: 'p1' })}
                queue={[makePost({ id: 'p2' })]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        expect(screen.getByText('NOW')).toBeInTheDocument();
    });

    it('slides in from the right, not the left', async () => {
        const user = userEvent.setup();
        const { container } = render(
            <QueuePanel
                current={makePost()}
                queue={[]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        const panel = container.querySelector('.fixed.inset-y-0');
        expect(panel?.className).toContain('right-0');
        expect(panel?.className).not.toContain('left-0');
    });

    it('selecting a queued post calls onSelectPost and closes the panel', async () => {
        const user = userEvent.setup();
        const onSelectPost = vi.fn();
        render(
            <QueuePanel
                current={makePost({ id: 'p1' })}
                queue={[makePost({ id: 'p2', author_name: 'Bob' })]}
                debugEnabled={false}
                onSelectPost={onSelectPost}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Jump to post by Bob' }),
        );

        expect(onSelectPost).toHaveBeenCalledWith('p2');
        expect(screen.queryByText('Up next · 2 posts')).not.toBeInTheDocument();
    });

    it('does not treat the current post as selectable', async () => {
        const user = userEvent.setup();
        const onSelectPost = vi.fn();
        render(
            <QueuePanel
                current={makePost({ id: 'p1', author_name: 'Alice' })}
                queue={[]}
                debugEnabled={false}
                onSelectPost={onSelectPost}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        expect(
            screen.queryByRole('button', { name: 'Jump to post by Alice' }),
        ).not.toBeInTheDocument();
    });

    it('shows a CW pill without hiding the post body', async () => {
        const user = userEvent.setup();
        render(
            <QueuePanel
                current={makePost({
                    id: 'p1',
                    cw_text: 'Spoilers',
                    body: 'the secret ending is revealed',
                })}
                queue={[]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        expect(screen.getByText('CW: Spoilers')).toBeInTheDocument();
        expect(
            screen.getByText('the secret ending is revealed'),
        ).toBeInTheDocument();
    });

    it('shows a picture icon in the header for posts with attached images', async () => {
        const user = userEvent.setup();
        render(
            <QueuePanel
                current={makePost({
                    id: 'p1',
                    media: [
                        {
                            type: 'image',
                            url: 'https://example.com/photo.jpg',
                            preview_url: null,
                            alt_text: null,
                        },
                    ],
                })}
                queue={[]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        expect(screen.getByLabelText('Has images')).toBeInTheDocument();
    });

    it('has no picture icon in the header for posts without media', async () => {
        const user = userEvent.setup();
        render(
            <QueuePanel
                current={makePost({ id: 'p1', media: [] })}
                queue={[]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        expect(screen.queryByLabelText('Has images')).not.toBeInTheDocument();
    });

    it('hides the console-dump button when debugEnabled is false', async () => {
        const user = userEvent.setup();
        render(
            <QueuePanel
                current={makePost()}
                queue={[]}
                debugEnabled={false}
                onSelectPost={vi.fn()}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );

        expect(
            screen.queryByLabelText('Dump post to console'),
        ).not.toBeInTheDocument();
    });

    it('shows the console-dump button when debugEnabled is true, without triggering selection', async () => {
        const user = userEvent.setup();
        const onSelectPost = vi.fn();
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        render(
            <QueuePanel
                current={makePost({ id: 'p1' })}
                queue={[makePost({ id: 'p2', author_name: 'Bob' })]}
                debugEnabled
                onSelectPost={onSelectPost}
            />,
        );

        await user.click(
            screen.getByRole('button', { name: 'Show upcoming posts' }),
        );
        await user.click(screen.getAllByLabelText('Dump post to console')[1]);

        expect(logSpy).toHaveBeenCalled();
        expect(onSelectPost).not.toHaveBeenCalled();

        logSpy.mockRestore();
    });
});
