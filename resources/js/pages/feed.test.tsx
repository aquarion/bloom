import {
    act,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import axios from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import Feed from './feed';

vi.mock('axios');
vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
    usePage: () => ({ props: { appVersion: null, isProduction: true } }),
}));

vi.mock('gsap', () => ({
    gsap: {
        timeline: vi.fn(() => ({
            to: vi.fn().mockReturnThis(),
            call: vi.fn().mockReturnThis(),
            fromTo: vi.fn().mockReturnThis(),
        })),
        set: vi.fn(),
    },
}));

vi.mock('@/components/feed/PostBackground', () => ({
    PostBackground: () => null,
}));
vi.mock('@/components/feed/PostContent', () => ({
    PostContent: vi.fn(() => null),
}));
vi.mock('@/components/feed/Attribution', () => ({ Attribution: () => null }));
vi.mock('@/components/feed/SourceBadge', () => ({ SourceBadge: () => null }));
vi.mock('@/components/feed/ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('@/components/feed/QueuePanel', () => ({ QueuePanel: () => null }));
vi.mock('@/components/feed/MentionChips', () => ({ MentionChips: () => null }));
vi.mock('@/components/feed/KeyboardShortcutsOverlay', () => ({
    KeyboardShortcutsOverlay: () => null,
}));
vi.mock('@/components/feed/FeedSidebarPanel', () => ({
    FeedSidebarPanel: ({ open }: { open: boolean }) => (
        <div data-testid="sidebar-panel" data-open={String(open)} />
    ),
}));
vi.mock('@/hooks/useWakeLock', () => ({
    useWakeLock: () => ({
        isSupported: false,
        isActive: false,
        toggle: vi.fn(),
    }),
}));
vi.mock('@/lib/debug', () => ({
    registerFeedDebug: vi.fn(),
    setupDebugWindow: vi.fn(),
}));

const makePost = (id: string, created_at?: string): Post => ({
    id,
    source: 'mastodon',
    source_handle: '',
    source_instance: null,
    author_name: 'Test',
    author_handle: '@test@example.com',
    author_avatar: '',
    author_banner: null,
    body: 'hello',
    media: [],
    created_at: created_at ?? new Date().toISOString(),
    original_url: `https://example.com/${id}`,
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
});

const oneAccount = [{ id: 1 }];

const defaultProps = {
    accounts: oneAccount,
    feedBufferSize: 200,
    debugEnabled: false,
    cwBehavior: 'show' as const,
    sensitiveMediaBehavior: 'show' as const,
    cwAuthorWhitelist: [] as string[],
};

beforeEach(() => {
    vi.mocked(axios.get).mockReset();
});

describe('Feed', () => {
    it('shows loading progress before any account has responded', () => {
        vi.mocked(axios.get).mockReturnValue(new Promise(() => {}));

        render(<Feed {...defaultProps} />);

        expect(screen.getByText('Loading posts… (0 of 1)')).toBeInTheDocument();
    });

    it('shows the empty state once every account has responded with nothing', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: { posts: [], next_cursor: null },
        });

        render(<Feed {...defaultProps} />);

        await waitFor(() =>
            expect(
                screen.getByText(/No posts — connect an account/i),
            ).toBeInTheDocument(),
        );
    });

    it('renders the navigation toggle button (not a link)', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: { posts: [makePost('1')], next_cursor: null },
        });

        render(<Feed {...defaultProps} />);

        const btn = await screen.findByRole('button', {
            name: /open navigation/i,
        });
        expect(btn).toBeInTheDocument();
    });

    it('opens the sidebar panel when the navigation button is clicked', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: { posts: [makePost('1')], next_cursor: null },
        });

        render(<Feed {...defaultProps} />);

        const panel = await screen.findByTestId('sidebar-panel');
        expect(panel).toHaveAttribute('data-open', 'false');

        fireEvent.click(
            screen.getByRole('button', { name: /open navigation/i }),
        );

        expect(panel).toHaveAttribute('data-open', 'true');
    });

    it('pressing j fires handleAdvance unconditionally (keyboard nav is not gated on CW overlay state)', async () => {
        const gsapModule = await import('gsap');
        const { gsap } = gsapModule;
        vi.mocked(gsap.timeline).mockClear();

        vi.mocked(axios.get).mockResolvedValue({
            data: {
                posts: [makePost('1'), makePost('2')],
                next_cursor: null,
            },
        });

        render(<Feed {...defaultProps} />);

        await screen.findByRole('button', { name: /open navigation/i });

        fireEvent.keyDown(window, { key: 'j' });

        expect(gsap.timeline).toHaveBeenCalled();
    });

    it('shows a loading spinner until the first post signals it is ready', async () => {
        const { PostContent } = await import('@/components/feed/PostContent');

        vi.mocked(axios.get).mockResolvedValue({
            data: { posts: [makePost('1')], next_cursor: null },
        });

        render(<Feed {...defaultProps} />);

        const overlay = await screen.findByTestId('initial-load-overlay');
        expect(overlay).toHaveClass('opacity-100');
        expect(screen.getByRole('status', { name: /loading/i })).toBeVisible();

        const { onReady } = vi.mocked(PostContent).mock.calls.at(-1)![0] as {
            onReady?: () => void;
        };
        act(() => onReady?.());

        expect(overlay).toHaveClass('opacity-0');
    });
});
