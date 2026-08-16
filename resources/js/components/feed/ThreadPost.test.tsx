import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import type { Post } from '@/types/post';
import { ThreadPost } from './ThreadPost';

const DURATION = 8000;
const TICK_MS = 100;

const readyCallbacks = new Map<string, () => void>();
const advanceCallbacks = new Map<string, () => void>();
const reduceMotionByPost = new Map<string, boolean | undefined>();

vi.mock('@/components/feed/PostAnimator', () => ({
    PostAnimator: ({
        post,
        onReady,
        onAdvance,
        reduceMotion,
    }: {
        post: Post;
        onReady?: () => void;
        onAdvance?: () => void;
        reduceMotion?: boolean;
    }) => {
        if (onReady) {
            readyCallbacks.set(post.id, onReady);
        }

        if (onAdvance) {
            advanceCallbacks.set(post.id, onAdvance);
        }

        reduceMotionByPost.set(post.id, reduceMotion);

        return <div data-testid={`post-animator-${post.id}`} />;
    },
}));

vi.mock('@inertiajs/react', () => ({
    Link: ({
        href,
        children,
        ...props
    }: {
        href: string | { url: string };
        children: ReactNode;
    }) => (
        <a href={typeof href === 'string' ? href : href.url} {...props}>
            {children}
        </a>
    ),
}));

vi.mock('@/components/feed/AuthorChip', () => ({
    AuthorChip: () => <div data-testid="author-chip" />,
}));

function renderWithCw(children: ReactNode) {
    return render(<CwStateProvider>{children}</CwStateProvider>);
}

const makePost = (overrides: Partial<Post> = {}): Post => ({
    id: 'p1',
    source: 'bluesky',
    source_handle: '@alice.bsky.social',
    source_instance: null,
    author_name: 'Alice',
    author_handle: '@alice.bsky.social',
    author_avatar: 'https://cdn.bsky.app/av.jpg',
    author_banner: null,
    body: 'hello',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://bsky.app/test',
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

beforeEach(() => {
    readyCallbacks.clear();
    advanceCallbacks.clear();
    reduceMotionByPost.clear();
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('ThreadPost', () => {
    it('renders only the first entry initially', () => {
        const thread = [makePost({ id: 'a' }), makePost({ id: 'b' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
            />,
        );

        expect(screen.getByTestId('post-animator-a')).toBeInTheDocument();
        expect(screen.queryByTestId('post-animator-b')).not.toBeInTheDocument();
    });

    it('does not advance before the active entry reports ready', () => {
        const thread = [makePost({ id: 'a' }), makePost({ id: 'b' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION * 3);
        });

        expect(screen.getByTestId('post-animator-a')).toBeInTheDocument();
    });

    it('advances to the next entry once the timer elapses after becoming ready', () => {
        const thread = [makePost({ id: 'a' }), makePost({ id: 'b' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
            />,
        );

        act(() => readyCallbacks.get('a')?.());
        act(() => vi.advanceTimersByTime(DURATION + TICK_MS));

        expect(screen.getByTestId('post-animator-b')).toBeInTheDocument();
    });

    it('calls onAdvance after the final entry finishes', () => {
        const onAdvance = vi.fn();
        const thread = [makePost({ id: 'a' }), makePost({ id: 'b' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={onAdvance}
            />,
        );

        act(() => readyCallbacks.get('a')?.());
        act(() => vi.advanceTimersByTime(DURATION + TICK_MS));
        expect(onAdvance).not.toHaveBeenCalled();

        act(() => readyCallbacks.get('b')?.());
        act(() => vi.advanceTimersByTime(DURATION + TICK_MS));
        expect(onAdvance).toHaveBeenCalledOnce();
    });

    it('advances via the entry itself calling onAdvance, without needing the timer (media entry)', () => {
        const thread = [makePost({ id: 'a' }), makePost({ id: 'b' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
            />,
        );

        // 'a' never becomes ready (as a media entry never fires onReady), but its
        // own nested carousel can still call onAdvance directly once it's done.
        act(() => advanceCallbacks.get('a')?.());

        expect(screen.getByTestId('post-animator-b')).toBeInTheDocument();
    });

    it('reports progress via onProgress with the active index and elapsed fraction', () => {
        const onProgress = vi.fn();
        const thread = [makePost({ id: 'a' }), makePost({ id: 'b' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
                onProgress={onProgress}
            />,
        );

        act(() => readyCallbacks.get('a')?.());
        act(() => vi.advanceTimersByTime(TICK_MS));

        expect(onProgress).toHaveBeenCalledWith(0, TICK_MS / DURATION);
    });

    it('does not advance while paused', () => {
        const onAdvance = vi.fn();
        const thread = [makePost({ id: 'a' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                paused
                onAdvance={onAdvance}
            />,
        );

        act(() => readyCallbacks.get('a')?.());
        act(() => vi.advanceTimersByTime(DURATION * 3));

        expect(onAdvance).not.toHaveBeenCalled();
    });

    it('threads reduceMotion through to the active thread entry (#312)', () => {
        const thread = [makePost({ id: 'a' }), makePost({ id: 'b' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
                reduceMotion
            />,
        );

        expect(reduceMotionByPost.get('a')).toBe(true);

        act(() => readyCallbacks.get('a')?.());
        act(() => vi.advanceTimersByTime(DURATION + TICK_MS));

        expect(reduceMotionByPost.get('b')).toBe(true);
    });

    it('defaults reduceMotion to false when omitted', () => {
        const thread = [makePost({ id: 'a' })];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
            />,
        );

        expect(reduceMotionByPost.get('a')).toBe(false);
    });

    it("applies each entry's own content warning independently", () => {
        const thread = [
            makePost({ id: 'a', cw_text: null }),
            makePost({
                id: 'b',
                cw_text: 'Adult content',
                cw_label_source: 'self',
            }),
        ];
        renderWithCw(
            <ThreadPost
                thread={thread}
                duration={DURATION}
                onAdvance={vi.fn()}
                cwBehavior="blur"
            />,
        );

        expect(
            screen.queryByText(/marked this post as adult content/i),
        ).not.toBeInTheDocument();

        act(() => readyCallbacks.get('a')?.());
        act(() => vi.advanceTimersByTime(DURATION + TICK_MS));

        expect(
            screen.getByText(/marked this post as adult content/i),
        ).toBeInTheDocument();
    });
});
