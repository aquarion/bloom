import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CwStateProvider } from '@/hooks/useCwState';
import type { Post } from '@/types/post';
import { FeedChrome } from './FeedChrome';

const pageProps = vi.hoisted(() => ({
    appVersion: null as { label: string; url: string | null } | null,
    isProduction: false,
}));

vi.mock('@inertiajs/react', () => ({
    usePage: () => ({ props: pageProps }),
}));

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

function renderChrome(paused: boolean) {
    return render(
        <CwStateProvider>
            <FeedChrome
                current={makePost()}
                queue={[]}
                debugEnabled={false}
                panelOpen={false}
                onTogglePanel={vi.fn()}
                onPanelOpenChange={vi.fn()}
                wakeLockSupported={false}
                wakeLockActive={false}
                onToggleWakeLock={vi.fn()}
                canGoBack={false}
                onGoBack={vi.fn()}
                paused={paused}
                onTogglePause={vi.fn()}
                onAdvance={vi.fn()}
                carouselProgress={null}
                progress={1}
                showHelp={false}
            />
        </CwStateProvider>,
    );
}

beforeEach(() => {
    pageProps.appVersion = null;
    pageProps.isProduction = false;
});

describe('FeedChrome — pause indicator', () => {
    it('shows a red border around the page when paused', () => {
        const { container } = renderChrome(true);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('border-red-500');
        expect(root.className).not.toContain('border-transparent');
    });

    it('has no red border when not paused', () => {
        const { container } = renderChrome(false);
        const root = container.firstElementChild as HTMLElement;

        expect(root.className).toContain('border-transparent');
        expect(root.className).not.toContain('border-red-500');
    });

    it('reflects paused state on the pause button', () => {
        renderChrome(true);

        expect(screen.getByLabelText('Resume')).toBeInTheDocument();
    });
});

describe('FeedChrome — version banner', () => {
    it('shows the version banner outside production', () => {
        pageProps.appVersion = { label: 'v1.11.2', url: null };
        pageProps.isProduction = false;
        renderChrome(false);

        expect(screen.getByText('v1.11.2')).toBeInTheDocument();
    });

    it('hides the version banner in production', () => {
        pageProps.appVersion = { label: 'v1.11.2', url: null };
        pageProps.isProduction = true;
        renderChrome(false);

        expect(screen.queryByText('v1.11.2')).not.toBeInTheDocument();
    });

    it('hides the version banner when no version is resolved', () => {
        pageProps.appVersion = null;
        pageProps.isProduction = false;
        renderChrome(false);

        expect(screen.queryByText('v1.11.2')).not.toBeInTheDocument();
    });
});
