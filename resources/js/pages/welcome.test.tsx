import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/matomo';
import type { Post } from '@/types/post';
import Welcome from './welcome';

vi.mock('@inertiajs/react', () => ({
    Head: () => null,
    Link: ({
        href,
        children,
        onClick,
    }: {
        href: string | { url: string };
        children: ReactNode;
        onClick?: () => void;
    }) => (
        <a href={typeof href === 'string' ? href : href.url} onClick={onClick}>
            {children}
        </a>
    ),
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

vi.mock('@/lib/matomo', () => ({
    trackEvent: vi.fn(),
}));

vi.mock('@/components/feed/PostBackground', () => ({
    PostBackground: () => null,
}));
vi.mock('@/components/feed/PostContent', () => ({ PostContent: () => null }));
vi.mock('@/components/feed/Attribution', () => ({ Attribution: () => null }));
vi.mock('@/components/feed/SourceBadge', () => ({ SourceBadge: () => null }));
vi.mock('@/components/feed/ProgressBar', () => ({ ProgressBar: () => null }));
vi.mock('@/routes', () => ({
    register: () => ({ url: '/register', method: 'get' }),
    login: () => ({ url: '/login', method: 'get' }),
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

describe('Welcome', () => {
    it('tracks a signup-click event when the sign up link is clicked', () => {
        render(<Welcome initialPosts={[makePost('1')]} canRegister />);

        fireEvent.click(screen.getByText('Sign up'));

        expect(trackEvent).toHaveBeenCalledWith('welcome', 'signup-click');
    });

    it('does not render the sign up link when registration is closed', () => {
        render(<Welcome initialPosts={[makePost('1')]} canRegister={false} />);

        expect(screen.queryByText('Sign up')).not.toBeInTheDocument();
    });
});
