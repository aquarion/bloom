# Welcome Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stock Laravel boilerplate `welcome.tsx` with a full-screen feed demo that serves as the public landing page for Bloom.

**Architecture:** A new `WelcomeController` fetches up to 10 posts from a configurable Mastodon public timeline, normalises them through `PostNormalizer`, and caches them with a two-key stale-while-revalidate pattern (long-lived data key + short-lived freshness key). On fetch failure it serves stale data; on cold cache + failure it falls back to hardcoded posts. The frontend reuses every feed component and the GSAP crossfade animation from `feed.tsx`, driven by a new `useWelcomeQueue` hook that loops the initial post set indefinitely instead of cursor-fetching.

**Tech Stack:** Laravel 11 (PHP 8.4), Inertia.js, React 19, TypeScript, GSAP, Tailwind CSS, Pest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `config/feed.php` | Modify | Add `welcome_instance` config key |
| `app/Http/Controllers/WelcomeController.php` | Create | Fetch, cache, normalise public timeline posts; serve welcome page or redirect auth'd users |
| `routes/web.php` | Modify | Replace home route closure with `WelcomeController` |
| `tests/Feature/WelcomeTest.php` | Create | Feature tests: routing, caching, filtering, fallback |
| `tests/Feature/ExampleTest.php` | Modify | Update assertion — `/` now shows a page, not a redirect |
| `resources/js/hooks/useWelcomeQueue.ts` | Create | Looping post queue (no API fetching, resets to `initialPosts` when exhausted) |
| `resources/js/hooks/useWelcomeQueue.test.ts` | Create | Unit tests for queue looping behaviour |
| `resources/js/pages/welcome.tsx` | Modify | Full-screen feed demo with Bloom CTA overlay |

---

### Task 1: Add welcome_instance config key

**Files:**
- Modify: `config/feed.php`

- [ ] **Step 1.1: Add the config key**

In `config/feed.php`, add after the existing `body_limit` entry:

```php
    // Mastodon instance used to fetch posts for the public welcome page
    'welcome_instance' => env('FEED_WELCOME_INSTANCE', 'mastodon.social'),
```

The file should end as:

```php
    // Maximum characters shown in main post body
    'body_limit' => env('FEED_BODY_LIMIT', 512),

    // Mastodon instance used to fetch posts for the public welcome page
    'welcome_instance' => env('FEED_WELCOME_INSTANCE', 'mastodon.social'),
];
```

- [ ] **Step 1.2: Commit**

```bash
git add config/feed.php
git commit -m "⚙️ Add welcome_instance config key for public timeline source"
```

---

### Task 2: WelcomeController — tests then implementation

**Files:**
- Create: `app/Http/Controllers/WelcomeController.php`
- Create: `tests/Feature/WelcomeTest.php`
- Modify: `tests/Feature/ExampleTest.php`
- Modify: `routes/web.php`

- [ ] **Step 2.1: Write failing feature tests**

Create `tests/Feature/WelcomeTest.php`:

```php
<?php

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function mastodonStatus(string $id, string $body): array
{
    return [
        'id' => $id,
        'content' => "<p>{$body}</p>",
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => "https://mastodon.social/@user/{$id}",
        'account' => [
            'display_name' => 'User',
            'acct' => 'user',
            'avatar' => '',
            'emojis' => [],
        ],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
        'in_reply_to_id' => null,
        'reblog' => null,
    ];
}

it('renders the welcome page for guests', function () {
    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response([]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->component('welcome', false)
            ->has('initialPosts')
            ->has('canRegister')
    );
});

it('redirects authenticated users to the feed', function () {
    $user = User::factory()->withPasskey()->create();
    $this->actingAs($user)->get('/')->assertRedirect(route('feed'));
});

it('passes normalised posts from the public timeline', function () {
    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response([
            mastodonStatus('1', 'Hello Fediverse'),
        ]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->component('welcome', false)
            ->where('initialPosts.0.source', 'mastodon')
            ->where('initialPosts.0.body', 'Hello Fediverse')
    );
});

it('filters out posts with an empty body', function () {
    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response([
            array_merge(mastodonStatus('1', ''), ['content' => '']),
            mastodonStatus('2', 'Has a body'),
        ]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->has('initialPosts', 1)
            ->where('initialPosts.0.body', 'Has a body')
    );
});

it('caches successfully fetched posts', function () {
    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response([
            mastodonStatus('99', 'Cacheable post'),
        ]),
    ]);

    $this->withoutVite()->get('/');

    expect(Cache::get('welcome.posts.data'))->not->toBeNull();
    expect(Cache::has('welcome.posts.fresh'))->toBeTrue();
});

it('serves a cached response on the second request without fetching again', function () {
    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response([
            mastodonStatus('1', 'First fetch'),
        ]),
    ]);

    $this->withoutVite()->get('/');
    $this->withoutVite()->get('/');

    Http::assertSentCount(1);
});

it('serves stale cache when the public timeline fetch fails', function () {
    $stale = [[
        'id' => 'mastodon_cached_1',
        'source' => 'mastodon',
        'source_handle' => '',
        'author_name' => 'Cached User',
        'author_handle' => '@cached@mastodon.social',
        'author_avatar' => '',
        'author_banner' => null,
        'body' => 'Stale cached body',
        'media' => [],
        'created_at' => '2024-01-01T00:00:00.000Z',
        'original_url' => '',
        'link_url' => null,
        'link_title' => null,
        'link_favicon' => null,
        'reply_to' => null,
        'quoted_post' => null,
        'boosted_by' => null,
        'boosted_by_avatar' => null,
        'boosted_by_handle' => null,
        'boosted_by_created_at' => null,
        'emojis' => [],
        'hashtags' => [],
    ]];

    Cache::put('welcome.posts.data', $stale, now()->addDays(7));
    // Omit 'welcome.posts.fresh' so freshness is expired

    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response(null, 500),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->where('initialPosts.0.id', 'mastodon_cached_1')
    );
});

it('falls back to hardcoded posts when cache is empty and fetch fails', function () {
    Http::fake([
        'mastodon.social/api/v1/timelines/public*' => Http::response(null, 500),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->component('welcome', false)->has('initialPosts')
    );

    expect(Cache::get('welcome.posts.data'))->toBeNull();
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
./vendor/bin/pest tests/Feature/WelcomeTest.php
```

Expected: All tests fail — `WelcomeController` class not found, `/` returns redirect.

- [ ] **Step 2.3: Create WelcomeController**

Create `app/Http/Controllers/WelcomeController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Services\Feed\PostNormalizer;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class WelcomeController extends Controller
{
    private const DATA_KEY = 'welcome.posts.data';
    private const FRESH_KEY = 'welcome.posts.fresh';
    private const DATA_TTL = 7 * 24 * 3600;
    private const FRESH_TTL = 6 * 3600;

    public function __construct(private PostNormalizer $normalizer) {}

    public function index()
    {
        if (auth()->check()) {
            return redirect()->route('feed');
        }

        return Inertia::render('welcome', [
            'initialPosts' => $this->getPosts(),
            'canRegister' => config('features.registration', true),
        ]);
    }

    private function getPosts(): array
    {
        $cached = Cache::get(self::DATA_KEY);

        if ($cached !== null && Cache::has(self::FRESH_KEY)) {
            return $cached;
        }

        try {
            $posts = $this->fetchAndNormalize();
            Cache::put(self::DATA_KEY, $posts, now()->addSeconds(self::DATA_TTL));
            Cache::put(self::FRESH_KEY, true, now()->addSeconds(self::FRESH_TTL));
            return $posts;
        } catch (\Throwable $e) {
            Log::warning('Welcome page post fetch failed', ['error' => $e->getMessage()]);
        }

        if ($cached !== null) {
            return $cached;
        }

        return $this->fallbackPosts();
    }

    private function fetchAndNormalize(): array
    {
        $instance = config('feed.welcome_instance', 'mastodon.social');

        $statuses = Http::timeout(10)
            ->get("https://{$instance}/api/v1/timelines/public", [
                'limit' => 10,
                'only_media' => 'false',
            ])
            ->throw()
            ->json();

        $normalised = array_map(
            fn (array $status) => $this->normalizer->fromMastodon($status, $instance),
            $statuses,
        );

        return array_values(array_filter($normalised, fn (array $post) => $post['body'] !== ''));
    }

    private function fallbackPosts(): array
    {
        $now = now()->toIso8601String();

        return [
            [
                'id' => 'welcome_1',
                'source' => 'mastodon',
                'source_handle' => '',
                'author_name' => 'alice',
                'author_handle' => '@alice@mastodon.social',
                'author_avatar' => '',
                'author_banner' => null,
                'body' => 'Just spotted a kingfisher by the canal. Those colours are absolutely unreal.',
                'media' => [],
                'created_at' => $now,
                'original_url' => '',
                'link_url' => null,
                'link_title' => null,
                'link_favicon' => null,
                'reply_to' => null,
                'quoted_post' => null,
                'boosted_by' => null,
                'boosted_by_avatar' => null,
                'boosted_by_handle' => null,
                'boosted_by_created_at' => null,
                'emojis' => [],
                'hashtags' => [],
            ],
            [
                'id' => 'welcome_2',
                'source' => 'mastodon',
                'source_handle' => '',
                'author_name' => 'bob',
                'author_handle' => '@bob@fosstodon.org',
                'author_avatar' => '',
                'author_banner' => null,
                'body' => 'Shipped a feature I\'d been putting off for weeks. Turns out it only took two hours.',
                'media' => [],
                'created_at' => $now,
                'original_url' => '',
                'link_url' => null,
                'link_title' => null,
                'link_favicon' => null,
                'reply_to' => null,
                'quoted_post' => null,
                'boosted_by' => null,
                'boosted_by_avatar' => null,
                'boosted_by_handle' => null,
                'boosted_by_created_at' => null,
                'emojis' => [],
                'hashtags' => [],
            ],
            [
                'id' => 'welcome_3',
                'source' => 'bluesky',
                'source_handle' => '',
                'author_name' => 'carol.bsky.social',
                'author_handle' => '@carol.bsky.social',
                'author_avatar' => '',
                'author_banner' => null,
                'body' => 'The thing I like most about the open web is that nobody owns the conversation.',
                'media' => [],
                'created_at' => $now,
                'original_url' => '',
                'link_url' => null,
                'link_title' => null,
                'link_favicon' => null,
                'reply_to' => null,
                'quoted_post' => null,
                'boosted_by' => null,
                'boosted_by_avatar' => null,
                'boosted_by_handle' => null,
                'boosted_by_created_at' => null,
                'emojis' => [],
                'hashtags' => [],
            ],
        ];
    }
}
```

- [ ] **Step 2.4: Update the home route**

In `routes/web.php`, add the import at the top with the other controller imports:

```php
use App\Http\Controllers\WelcomeController;
```

Then replace the home route:

```php
// Before:
Route::get('/', fn () => redirect()->route(auth()->check() ? 'feed' : 'login'))->name('home');

// After:
Route::get('/', [WelcomeController::class, 'index'])->name('home');
```

- [ ] **Step 2.5: Update ExampleTest.php**

`tests/Feature/ExampleTest.php` currently asserts the home route redirects to login. Replace it entirely:

```php
<?php

test('home page renders for guests', function () {
    $response = $this->withoutVite()->get(route('home'));
    $response->assertOk();
});
```

(The full routing behaviour is covered by WelcomeTest.php.)

- [ ] **Step 2.6: Run the new feature tests**

```bash
./vendor/bin/pest tests/Feature/WelcomeTest.php
```

Expected: All 8 tests pass.

- [ ] **Step 2.7: Run full suite to check for regressions**

```bash
./vendor/bin/pest
```

Expected: All tests pass.

- [ ] **Step 2.8: Commit**

```bash
git add app/Http/Controllers/WelcomeController.php routes/web.php \
        tests/Feature/WelcomeTest.php tests/Feature/ExampleTest.php
git commit -m "🎇 Add WelcomeController with public timeline caching and fallback"
```

---

### Task 3: useWelcomeQueue hook

**Files:**
- Create: `resources/js/hooks/useWelcomeQueue.ts`
- Create: `resources/js/hooks/useWelcomeQueue.test.ts`

- [ ] **Step 3.1: Write failing unit tests**

Create `resources/js/hooks/useWelcomeQueue.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWelcomeQueue } from './useWelcomeQueue';
import type { Post } from '@/types/post';

function makePost(id: string): Post {
    return {
        id,
        source: 'mastodon',
        source_handle: '',
        author_name: 'Test',
        author_handle: '@test@example.com',
        author_avatar: '',
        author_banner: null,
        body: `Post ${id}`,
        media: [],
        created_at: '2024-01-01T00:00:00.000Z',
        original_url: '',
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
    };
}

const posts = [makePost('a'), makePost('b'), makePost('c')];

describe('useWelcomeQueue', () => {
    it('initialises with the first post as current', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        expect(result.current.current?.id).toBe('a');
    });

    it('initialises queue with the remaining posts', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        expect(result.current.queue.map((p) => p.id)).toEqual(['b', 'c']);
    });

    it('advance moves queue[0] to current', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        act(() => result.current.advance());
        expect(result.current.current?.id).toBe('b');
        expect(result.current.queue.map((p) => p.id)).toEqual(['c']);
    });

    it('loops back to the start when queue is exhausted', () => {
        const { result } = renderHook(() => useWelcomeQueue(posts));
        act(() => result.current.advance()); // a → b
        act(() => result.current.advance()); // b → c
        act(() => result.current.advance()); // c → a (loop)
        expect(result.current.current?.id).toBe('a');
        expect(result.current.queue.map((p) => p.id)).toEqual(['b', 'c']);
    });

    it('handles a single-post list by looping back to it', () => {
        const { result } = renderHook(() => useWelcomeQueue([makePost('only')]));
        act(() => result.current.advance());
        expect(result.current.current?.id).toBe('only');
    });
});
```

- [ ] **Step 3.2: Run tests to confirm they fail**

```bash
npx vitest run resources/js/hooks/useWelcomeQueue.test.ts
```

Expected: FAIL — `useWelcomeQueue` not found.

- [ ] **Step 3.3: Implement useWelcomeQueue**

Create `resources/js/hooks/useWelcomeQueue.ts`:

```ts
import { useCallback, useReducer } from 'react';
import type { Post } from '@/types/post';

type State = { current: Post | null; queue: Post[] };

function makeReducer(initialPosts: Post[]) {
    return function (state: State, _action: { type: 'advance' }): State {
        if (state.queue.length === 0) {
            return {
                current: initialPosts[0] ?? null,
                queue: initialPosts.slice(1),
            };
        }
        const [next, ...rest] = state.queue;
        return { current: next, queue: rest };
    };
}

export function useWelcomeQueue(initialPosts: Post[]) {
    const [state, dispatch] = useReducer(makeReducer(initialPosts), {
        current: initialPosts[0] ?? null,
        queue: initialPosts.slice(1),
    });

    const advance = useCallback(() => dispatch({ type: 'advance' }), []);

    return { current: state.current, queue: state.queue, advance };
}
```

- [ ] **Step 3.4: Run tests**

```bash
npx vitest run resources/js/hooks/useWelcomeQueue.test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add resources/js/hooks/useWelcomeQueue.ts resources/js/hooks/useWelcomeQueue.test.ts
git commit -m "🎇 Add useWelcomeQueue hook with looping advance"
```

---

### Task 4: Rewrite welcome.tsx

**Files:**
- Modify: `resources/js/pages/welcome.tsx`

The full-screen feed demo is `feed.tsx` minus the auth-only chrome (dashboard link, wake lock, pause button, debug panel) plus Bloom branding and CTAs at the bottom.

- [ ] **Step 4.1: Replace welcome.tsx**

Replace the entire contents of `resources/js/pages/welcome.tsx`:

```tsx
import { Head, Link } from '@inertiajs/react';
import { gsap } from 'gsap';
import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import AppLogoIcon from '@/components/app-logo-icon';
import { Attribution } from '@/components/feed/Attribution';
import { PostBackground } from '@/components/feed/PostBackground';
import { PostContent } from '@/components/feed/PostContent';
import { ProgressBar } from '@/components/feed/ProgressBar';
import { SourceBadge } from '@/components/feed/SourceBadge';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { useWelcomeQueue } from '@/hooks/useWelcomeQueue';
import { login, register } from '@/routes';
import type { Post } from '@/types/post';

export default function Welcome({
    initialPosts,
    canRegister = true,
}: {
    initialPosts: Post[];
    canRegister?: boolean;
}) {
    const { current, advance, queue } = useWelcomeQueue(initialPosts);
    const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
    const animationReady = readyForPostId === current?.id;
    const bgRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const transitionEndRef = useRef(0);
    const [nextBackground, setNextBackground] = useState<Post | null>(
        () => initialPosts[1] ?? initialPosts[0] ?? null,
    );

    const handleAdvance = useCallback(() => {
        const bg = bgRef.current;
        const content = contentRef.current;

        if (!bg || !content || Date.now() < transitionEndRef.current) {
            return;
        }

        const nextNext: Post | null = queue[1] ?? queue[0] ?? current;
        transitionEndRef.current = Date.now() + 700;
        let advanceSucceeded = false;

        gsap.timeline({
            onComplete: () => {
                if (advanceSucceeded) {
                    setNextBackground(nextNext);
                }
            },
        })
            .to(bg, { opacity: 0, duration: 0.3, ease: 'power2.inOut' }, 0)
            .to(
                content,
                { scale: 1.3, filter: 'blur(8px)', opacity: 0, duration: 0.3, ease: 'power2.in' },
                0,
            )
            .call(
                () => {
                    flushSync(() => advance());
                    advanceSucceeded = true;
                    gsap.set(bg, { opacity: 1 });
                },
                undefined,
                0.3,
            )
            .fromTo(
                content,
                { scale: 0.7, filter: 'blur(8px)', opacity: 0 },
                { scale: 1, filter: 'blur(0px)', opacity: 1, duration: 0.3, ease: 'power2.out' },
                0.3,
            );
    }, [advance, current, queue]);

    const { progress } = useAutoAdvance({
        duration: 8000,
        paused: !animationReady,
        onAdvance: handleAdvance,
    });

    if (!current) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white">
                <p className="text-sm opacity-50">No posts available.</p>
            </div>
        );
    }

    return (
        <>
            <Head title="Bloom — social media without the scroll" />
            <div className="relative h-screen w-screen overflow-hidden bg-black">
                {/* Background layer */}
                <div className="absolute inset-0 z-0">
                    <PostBackground post={nextBackground ?? current} />
                    <div ref={bgRef} className="absolute inset-0 bg-black">
                        <PostBackground post={current} />
                    </div>
                </div>

                {/* Content layer */}
                <div ref={contentRef} className="absolute inset-0 z-10">
                    <PostContent
                        post={current}
                        onReady={() => setReadyForPostId(current.id)}
                    />
                </div>

                {/* Chrome layer */}
                <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
                    <div className="pointer-events-auto flex items-center gap-2 p-4">
                        <SourceBadge post={current} />
                    </div>

                    <div className="flex-1" />

                    <div className="pointer-events-auto flex flex-col px-4 pt-2 pb-6 gap-4">
                        <Attribution post={current} />

                        <div className="border-t border-white/10 pt-4">
                            <div className="flex items-center gap-2 mb-1">
                                <AppLogoIcon className="size-5" />
                                <span className="text-xs font-semibold tracking-wide uppercase text-white/50">
                                    Bloom
                                </span>
                            </div>
                            <p className="text-white font-semibold text-lg leading-tight mb-1">
                                Social media. Without the scroll.
                            </p>
                            <p className="text-white/40 text-xs mb-4">
                                Full-screen · Mastodon &amp; Bluesky · No algorithm
                            </p>
                            <div className="flex gap-3">
                                {canRegister && (
                                    <Link
                                        href={register()}
                                        className="flex-1 rounded-lg bg-white py-3 text-center text-sm font-semibold text-black hover:bg-white/90"
                                    >
                                        Sign up
                                    </Link>
                                )}
                                <Link
                                    href={login()}
                                    className="flex-1 rounded-lg border border-white/20 bg-white/10 py-3 text-center text-sm font-medium text-white/80 hover:bg-white/15"
                                >
                                    Log in
                                </Link>
                            </div>
                        </div>
                    </div>

                    <ProgressBar progress={progress} />
                </div>
            </div>
        </>
    );
}
```

- [ ] **Step 4.2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4.3: Run full test suite**

```bash
./vendor/bin/pest
```

Expected: All tests pass.

- [ ] **Step 4.4: Commit**

```bash
git add resources/js/pages/welcome.tsx
git commit -m "🎇 Rewrite welcome page as full-screen feed demo"
```

---

After this commit, start the dev server (`bin/dev-server.sh` or `overmind start`) and open `http://localhost` in a browser to verify the animated feed demo renders, posts cycle every 8 seconds, the Bloom CTA panel is visible at the bottom, and the Sign up / Log in links work.
