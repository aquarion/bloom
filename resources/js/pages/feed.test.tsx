import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import Feed from './feed';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({ children }: { children: ReactNode }) => <>{children}</>,
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
vi.mock('@/components/feed/PostContent', () => ({ PostContent: () => null }));
vi.mock('@/components/feed/Attribution', () => ({ Attribution: () => null }));
vi.mock('@/components/feed/SourceBadge', () => ({ SourceBadge: () => null }));
vi.mock('@/components/feed/ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('@/components/feed/DebugPanel', () => ({ DebugPanel: () => null }));
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

const makePost = (id: string): Post => ({
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
    created_at: new Date().toISOString(),
    original_url: 'https://example.com',
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
});

const defaultProps = {
    initialPosts: [makePost('1')],
    initialCursor: null,
    debugEnabled: false,
    cwBehavior: 'show' as const,
    sensitiveMediaBehavior: 'show' as const,
};

describe('Feed', () => {
    it('renders the navigation toggle button (not a link)', () => {
        render(<Feed {...defaultProps} />);
        const btn = screen.getByRole('button', { name: /open navigation/i });
        expect(btn).toBeInTheDocument();
    });

    it('opens the sidebar panel when the navigation button is clicked', () => {
        render(<Feed {...defaultProps} />);
        const panel = screen.getByTestId('sidebar-panel');
        expect(panel).toHaveAttribute('data-open', 'false');

        fireEvent.click(
            screen.getByRole('button', { name: /open navigation/i }),
        );

        expect(panel).toHaveAttribute('data-open', 'true');
    });
});
