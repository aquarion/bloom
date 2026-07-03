# Image Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dim-background image treatment with a full-screen image carousel that auto-advances per image, letting users actually see the photos in posts.

**Architecture:** A new `ImageCarousel` component manages image display and per-image timing internally. `PostAnimator` delegates to it whenever `post.media.length > 0`, rendering the carousel in the upper portion and any post text in a compact panel below. The `paused` state from `feed.tsx` is threaded down through `PostContent` → `PostAnimator` → `ImageCarousel` so spacebar pause works mid-carousel.

**Tech Stack:** React, TypeScript, Vitest + Testing Library, Tailwind CSS

---

## File Map

| File | Action |
|---|---|
| `resources/js/components/feed/ImageCarousel.tsx` | **Create** — carousel component with timer, progress bars, tap zones |
| `resources/js/components/feed/ImageCarousel.test.tsx` | **Create** — unit tests for all carousel behaviour |
| `resources/js/components/feed/PostAnimator.tsx` | **Modify** — add image branch at top; add `paused` prop |
| `resources/js/components/feed/PostAnimator.test.tsx` | **Create** — tests for image branch delegation |
| `resources/js/components/feed/PostBackground.tsx` | **Modify** — skip `MediaBackground` when `post.media.length > 0` |
| `resources/js/components/feed/PostContent.tsx` | **Modify** — accept and forward `paused` prop |
| `resources/js/pages/feed.tsx` | **Modify** — pass `paused` to `PostContent` |

---

## Task 1: `ImageCarousel` — single-image render and timer

**Files:**
- Create: `resources/js/components/feed/ImageCarousel.tsx`
- Create: `resources/js/components/feed/ImageCarousel.test.tsx`

- [ ] **Step 1.1: Create the test file with failing tests for single-image render and timer completion**

`resources/js/components/feed/ImageCarousel.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAttachment } from '@/types/post';
import { ImageCarousel } from './ImageCarousel';

const DURATION = 8000;
const TICK_MS = 100;

const makeImage = (url: string, alt = ''): MediaAttachment => ({
    type: 'image',
    url,
    preview_url: null,
    alt_text: alt || null,
});

const defaultProps = {
    duration: DURATION,
    paused: false,
    blurMedia: false,
    onRevealMedia: vi.fn(),
    onComplete: vi.fn(),
};

describe('ImageCarousel — single image', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('renders the image with its alt text', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg', 'a sunset')]}
            />,
        );
        expect(screen.getByAltText('a sunset')).toBeInTheDocument();
    });

    it('renders one progress bar for a single image', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
            />,
        );
        expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    });

    it('calls onComplete after the full duration elapses', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION + TICK_MS);
        });

        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('does not call onComplete before the duration elapses', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION - TICK_MS);
        });

        expect(onComplete).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 1.2: Run the tests to confirm they fail**

```bash
npm test -- ImageCarousel --run
```

Expected: `Cannot find module './ImageCarousel'`

- [ ] **Step 1.3: Create the component with single-image render and timer**

`resources/js/components/feed/ImageCarousel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { MediaAttachment } from '@/types/post';

const TICK_MS = 100;

export function ImageCarousel({
    media,
    duration,
    paused,
    blurMedia,
    onRevealMedia,
    onComplete,
}: {
    media: MediaAttachment[];
    duration: number;
    paused: boolean;
    blurMedia: boolean;
    onRevealMedia: () => void;
    onComplete: () => void;
}) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [filled, setFilled] = useState(0);
    const elapsedRef = useRef(0);
    const onCompleteRef = useRef(onComplete);
    onCompleteRef.current = onComplete;

    const isPaused = paused || blurMedia;

    // Reset timer when the active image changes
    useEffect(() => {
        elapsedRef.current = 0;
        setFilled(0);
    }, [activeIndex]);

    // Run the per-image timer
    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(() => {
            elapsedRef.current += TICK_MS;
            setFilled(Math.min(1, elapsedRef.current / duration));

            if (elapsedRef.current >= duration) {
                elapsedRef.current = 0;

                if (activeIndex < media.length - 1) {
                    setActiveIndex((i) => i + 1);
                } else {
                    onCompleteRef.current();
                }
            }
        }, TICK_MS);

        return () => clearInterval(interval);
    }, [isPaused, duration, activeIndex, media.length]);

    const handleNext = () => {
        if (activeIndex < media.length - 1) {
            setActiveIndex((i) => i + 1);
        } else {
            onCompleteRef.current();
        }
    };

    const handlePrev = () => {
        if (activeIndex > 0) {
            setActiveIndex((i) => i - 1);
        }
    };

    const current = media[activeIndex];
    const src =
        current?.type === 'video'
            ? (current.preview_url ?? undefined)
            : current?.url;

    return (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
            {/* Progress bars */}
            <div className="absolute top-0 right-0 left-0 z-10 flex gap-1 p-2">
                {media.map((_, idx) => (
                    <div
                        key={idx}
                        role="progressbar"
                        aria-valuenow={
                            idx < activeIndex
                                ? 100
                                : idx === activeIndex
                                  ? Math.round(filled * 100)
                                  : 0
                        }
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30"
                    >
                        <div
                            className="h-full bg-white"
                            style={{
                                width:
                                    idx < activeIndex
                                        ? '100%'
                                        : idx === activeIndex
                                          ? `${filled * 100}%`
                                          : '0%',
                                transition: 'none',
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Image */}
            {src && (
                <img
                    src={src}
                    alt={current?.alt_text ?? ''}
                    className={`max-h-full max-w-full object-contain p-4 transition-all duration-300 ${blurMedia ? 'blur-xl' : ''}`}
                />
            )}

            {/* Sensitive media overlay */}
            {blurMedia && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <button
                        type="button"
                        onClick={onRevealMedia}
                        className="rounded-full bg-black/60 px-4 py-1.5 text-sm text-white hover:bg-black/80"
                    >
                        Show sensitive media
                    </button>
                </div>
            )}

            {/* Tap zones */}
            <button
                type="button"
                data-testid="carousel-prev"
                className="absolute top-0 left-0 h-full w-1/2 cursor-default"
                aria-label="Previous image"
                onClick={handlePrev}
            />
            <button
                type="button"
                data-testid="carousel-next"
                className="absolute top-0 right-0 h-full w-1/2 cursor-default"
                aria-label="Next image"
                onClick={handleNext}
            />
        </div>
    );
}
```

- [ ] **Step 1.4: Run the tests to confirm they pass**

```bash
npm test -- ImageCarousel --run
```

Expected: all 4 single-image tests pass.

- [ ] **Step 1.5: Commit**

```bash
git add resources/js/components/feed/ImageCarousel.tsx resources/js/components/feed/ImageCarousel.test.tsx
git commit -m "🎇 Add ImageCarousel component with single-image timer (#136)"
```

---

## Task 2: `ImageCarousel` — multi-image navigation

**Files:**
- Modify: `resources/js/components/feed/ImageCarousel.test.tsx`

- [ ] **Step 2.1: Add failing tests for multi-image behaviour**

Append to `resources/js/components/feed/ImageCarousel.test.tsx`:

```tsx
describe('ImageCarousel — multiple images', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('renders one progress bar per image', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[
                    makeImage('a.jpg'),
                    makeImage('b.jpg'),
                    makeImage('c.jpg'),
                ]}
            />,
        );
        expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    });

    it('shows the first image initially', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg', 'first'), makeImage('b.jpg', 'second')]}
            />,
        );
        expect(screen.getByAltText('first')).toBeInTheDocument();
        expect(screen.queryByAltText('second')).not.toBeInTheDocument();
    });

    it('advances to the second image after one duration elapses', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg', 'first'), makeImage('b.jpg', 'second')]}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION + TICK_MS);
        });

        expect(screen.queryByAltText('first')).not.toBeInTheDocument();
        expect(screen.getByAltText('second')).toBeInTheDocument();
    });

    it('calls onComplete only after all images have been shown', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg'), makeImage('b.jpg')]}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION + TICK_MS); // after image 1
        });
        expect(onComplete).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(DURATION); // after image 2
        });
        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('advances to next image when right tap zone is clicked', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg', 'first'), makeImage('b.jpg', 'second')]}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-next'));

        expect(screen.queryByAltText('first')).not.toBeInTheDocument();
        expect(screen.getByAltText('second')).toBeInTheDocument();
    });

    it('calls onComplete immediately when right tap zone is clicked on the last image', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg', 'first')]}
                onComplete={onComplete}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-next'));

        expect(onComplete).toHaveBeenCalledOnce();
    });

    it('goes back to the previous image when left tap zone is clicked', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg', 'first'), makeImage('b.jpg', 'second')]}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-next'));
        expect(screen.getByAltText('second')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('carousel-prev'));
        expect(screen.getByAltText('first')).toBeInTheDocument();
    });

    it('does nothing when left tap zone is clicked on the first image', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('a.jpg', 'first'), makeImage('b.jpg', 'second')]}
            />,
        );

        fireEvent.click(screen.getByTestId('carousel-prev'));

        expect(screen.getByAltText('first')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2.2: Run to confirm they pass (the component already supports all this)**

```bash
npm test -- ImageCarousel --run
```

Expected: all tests pass. The implementation from Task 1 already handles multi-image correctly.

- [ ] **Step 2.3: Commit**

```bash
git add resources/js/components/feed/ImageCarousel.test.tsx
git commit -m "🎇 Add multi-image carousel navigation tests (#136)"
```

---

## Task 3: `ImageCarousel` — pause and sensitive media blur

**Files:**
- Modify: `resources/js/components/feed/ImageCarousel.test.tsx`

- [ ] **Step 3.1: Add failing tests for pause and blur**

Append to `resources/js/components/feed/ImageCarousel.test.tsx`:

```tsx
describe('ImageCarousel — pause and sensitive media', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('does not advance when paused is true', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                paused={true}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION * 3);
        });

        expect(onComplete).not.toHaveBeenCalled();
    });

    it('does not advance when blurMedia is true', () => {
        const onComplete = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                blurMedia={true}
                onComplete={onComplete}
            />,
        );

        act(() => {
            vi.advanceTimersByTime(DURATION * 3);
        });

        expect(onComplete).not.toHaveBeenCalled();
    });

    it('shows "Show sensitive media" button when blurMedia is true', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg', 'private photo')]}
                blurMedia={true}
            />,
        );

        expect(
            screen.getByRole('button', { name: /show sensitive media/i }),
        ).toBeInTheDocument();
    });

    it('does not show the reveal button when blurMedia is false', () => {
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                blurMedia={false}
            />,
        );

        expect(
            screen.queryByRole('button', { name: /show sensitive media/i }),
        ).not.toBeInTheDocument();
    });

    it('calls onRevealMedia when the reveal button is clicked', () => {
        const onRevealMedia = vi.fn();
        render(
            <ImageCarousel
                {...defaultProps}
                media={[makeImage('photo.jpg')]}
                blurMedia={true}
                onRevealMedia={onRevealMedia}
            />,
        );

        fireEvent.click(
            screen.getByRole('button', { name: /show sensitive media/i }),
        );

        expect(onRevealMedia).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 3.2: Run to confirm they pass (implementation already handles this)**

```bash
npm test -- ImageCarousel --run
```

Expected: all tests pass.

- [ ] **Step 3.3: Commit**

```bash
git add resources/js/components/feed/ImageCarousel.test.tsx
git commit -m "🎇 Add pause and sensitive-media tests for ImageCarousel (#136)"
```

---

## Task 4: `PostBackground` — stop using images as dim backgrounds

**Files:**
- Modify: `resources/js/components/feed/PostBackground.tsx`

The current code renders `<MediaBackground>` (the dim 40%-opacity image) when `post.media.length > 0`. We remove that so image posts get a clean solid-colour or author-banner background behind the text panel.

- [ ] **Step 4.1: Read the current file**

Read `resources/js/components/feed/PostBackground.tsx` to confirm the current structure before editing.

Current content:
```tsx
import { postDisplayColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';
import { MediaBackground } from './MediaBackground';

export function PostBackground({ post }: { post: Post }) {
    const colors = postDisplayColors(post);

    return (
        <div
            className="absolute inset-0 overflow-hidden"
            style={colors ? { backgroundColor: colors.background } : undefined}
        >
            {post.media.length > 0 && <MediaBackground media={post.media} />}
            {!post.media.length && post.author_banner && (
                <div className="pointer-events-none absolute inset-0 z-0">
                    <img
                        src={post.author_banner}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{
                            opacity: 0.7,
                            filter: 'blur(24px)',
                            transform: 'scale(1.1)',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4.2: Remove the MediaBackground render for image posts**

In `resources/js/components/feed/PostBackground.tsx`, replace the two conditional blocks with a single one that only shows the author banner when there is no media:

```tsx
import { postDisplayColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';

export function PostBackground({ post }: { post: Post }) {
    const colors = postDisplayColors(post);

    return (
        <div
            className="absolute inset-0 overflow-hidden"
            style={colors ? { backgroundColor: colors.background } : undefined}
        >
            {!post.media.length && post.author_banner && (
                <div className="pointer-events-none absolute inset-0 z-0">
                    <img
                        src={post.author_banner}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{
                            opacity: 0.7,
                            filter: 'blur(24px)',
                            transform: 'scale(1.1)',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
```

Note: the `MediaBackground` import is removed since it's no longer used here.

- [ ] **Step 4.3: Run the full test suite to confirm nothing breaks**

```bash
npm test -- --run
```

Expected: all existing tests pass (PostBackground has no direct tests; feed.test.tsx mocks it).

- [ ] **Step 4.4: Commit**

```bash
git add resources/js/components/feed/PostBackground.tsx
git commit -m "🔄 Stop rendering dim image background for image posts (#136)"
```

---

## Task 5: Thread `paused` prop from `feed.tsx` → `PostContent` → `PostAnimator`

**Files:**
- Modify: `resources/js/pages/feed.tsx`
- Modify: `resources/js/components/feed/PostContent.tsx`
- Modify: `resources/js/components/feed/PostAnimator.tsx`

These three changes go together — they're all prop threading with no logic of their own.

- [ ] **Step 5.1: Add `paused` prop to `PostAnimator`**

In `resources/js/components/feed/PostAnimator.tsx`, add `paused` to the props destructure and type definition. Find the `PostAnimator` function signature (around line 148) and update it:

```tsx
export function PostAnimator({
    post,
    colors,
    onReady,
    blurMedia = false,
    onRevealMedia,
    paused = false,
}: {
    post: Post;
    colors: PostColors | null;
    onReady?: () => void;
    blurMedia?: boolean;
    onRevealMedia?: () => void;
    paused?: boolean;
}) {
```

The `paused` prop is not used yet in PostAnimator itself — it will be passed to `ImageCarousel` in Task 6. Adding it here first keeps the changes atomic.

- [ ] **Step 5.2: Add `paused` prop to `PostContent`**

In `resources/js/components/feed/PostContent.tsx`, update the function signature and pass `paused` through to `PostAnimator`:

```tsx
export function PostContent({
    post,
    onReady,
    cwBehavior = 'show',
    sensitiveMediaBehavior = 'show',
    paused = false,
}: {
    post: Post;
    onReady?: () => void;
    cwBehavior?: ContentBehavior;
    sensitiveMediaBehavior?: ContentBehavior;
    paused?: boolean;
}) {
    const colors = postDisplayColors(post);
    const [cwRevealed, setCwRevealed] = useState(false);
    const [mediaRevealed, setMediaRevealed] = useState(false);

    const cwText = post.cw_text;
    const showCwOverlay =
        cwText !== null && cwBehavior === 'blur' && !cwRevealed;
    const blurMedia =
        post.sensitive_media &&
        sensitiveMediaBehavior === 'blur' &&
        !mediaRevealed;

    return (
        <div className="relative flex h-full w-full items-center justify-center">
            <PostAnimator
                post={post}
                colors={colors}
                onReady={onReady}
                blurMedia={blurMedia}
                onRevealMedia={() => setMediaRevealed(true)}
                paused={paused}
            />
            {showCwOverlay && cwText !== null && (
                <CwOverlay
                    cwText={cwText}
                    onReveal={() => setCwRevealed(true)}
                />
            )}
        </div>
    );
}
```

- [ ] **Step 5.3: Pass `paused` from `feed.tsx` to `PostContent`**

In `resources/js/pages/feed.tsx`, find the `<PostContent>` render (around line 231) and add `paused={paused}`:

```tsx
<PostContent
    post={current}
    cwBehavior={cwBehavior}
    sensitiveMediaBehavior={sensitiveMediaBehavior}
    paused={paused}
    onReady={() => setReadyForPostId(current.id)}
/>
```

- [ ] **Step 5.4: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests pass. TypeScript should also be clean:

```bash
npm run types:check
```

- [ ] **Step 5.5: Commit**

```bash
git add resources/js/pages/feed.tsx resources/js/components/feed/PostContent.tsx resources/js/components/feed/PostAnimator.tsx
git commit -m "🔄 Thread paused prop from feed through PostContent to PostAnimator (#136)"
```

---

## Task 6: `PostAnimator` — delegate to `ImageCarousel` for image posts

**Files:**
- Create: `resources/js/components/feed/PostAnimator.test.tsx`
- Modify: `resources/js/components/feed/PostAnimator.tsx`

This is the core wiring: when `post.media.length > 0`, render `ImageCarousel` filling the upper area and the post body in a compact panel below. The existing text animation path is untouched.

- [ ] **Step 6.1: Write failing tests for the PostAnimator image branch**

`resources/js/components/feed/PostAnimator.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MediaAttachment, Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

// Mock GSAP to prevent animation errors in tests
vi.mock('gsap', () => ({
    default: {
        registerPlugin: vi.fn(),
        timeline: vi.fn(() => ({
            to: vi.fn().mockReturnThis(),
            fromTo: vi.fn().mockReturnThis(),
            kill: vi.fn(),
        })),
        set: vi.fn(),
    },
}));

vi.mock('@gsap/react', () => ({
    useGSAP: vi.fn(),
}));

vi.mock('@/lib/animations', () => ({
    pickTemplate: vi.fn(),
    SplitText: class {},
}));

// Mock ImageCarousel so PostAnimator tests stay focused on the branch logic
vi.mock('@/components/feed/ImageCarousel', () => ({
    ImageCarousel: ({
        onComplete,
        media,
    }: {
        onComplete: () => void;
        media: MediaAttachment[];
    }) => (
        <div data-testid="image-carousel" data-count={media.length}>
            <button type="button" onClick={onComplete}>
                carousel-done
            </button>
        </div>
    ),
}));

const makeImage = (url: string): MediaAttachment => ({
    type: 'image',
    url,
    preview_url: null,
    alt_text: null,
});

const makePost = (overrides: Partial<Post> = {}): Post => ({
    id: 'p1',
    source: 'bluesky',
    source_handle: '@test.bsky.social',
    source_instance: null,
    author_name: 'Test',
    author_handle: '@test.bsky.social',
    author_avatar: '',
    author_banner: null,
    body: '',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://bsky.app/test',
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
    sensitive_media: false,
    ...overrides,
});

describe('PostAnimator — image branch', () => {
    it('renders ImageCarousel when post has media', () => {
        render(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toBeInTheDocument();
    });

    it('passes all media items to ImageCarousel', () => {
        render(
            <PostAnimator
                post={makePost({
                    media: [makeImage('a.jpg'), makeImage('b.jpg')],
                })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toHaveAttribute(
            'data-count',
            '2',
        );
    });

    it('shows the post body below the carousel when body and media are both present', () => {
        render(
            <PostAnimator
                post={makePost({
                    media: [makeImage('a.jpg')],
                    body: 'Look at this photo',
                })}
                colors={null}
            />,
        );
        expect(screen.getByTestId('image-carousel')).toBeInTheDocument();
        expect(screen.getByText('Look at this photo')).toBeInTheDocument();
    });

    it('calls onReady when ImageCarousel calls onComplete', () => {
        const onReady = vi.fn();
        render(
            <PostAnimator
                post={makePost({ media: [makeImage('a.jpg')] })}
                colors={null}
                onReady={onReady}
            />,
        );

        fireEvent.click(screen.getByText('carousel-done'));

        expect(onReady).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 6.2: Run to confirm the tests fail**

```bash
npm test -- PostAnimator --run
```

Expected: tests fail because the image branch doesn't exist yet in PostAnimator.

- [ ] **Step 6.3: Read the current PostAnimator file in full**

Read `resources/js/components/feed/PostAnimator.tsx` to confirm the structure before editing.

- [ ] **Step 6.2: Add the image branch to `PostAnimator`**

In `resources/js/components/feed/PostAnimator.tsx`:

1. Add the `ImageCarousel` import at the top:
```tsx
import { ImageCarousel } from './ImageCarousel';
```

2. In the `PostAnimator` function body, add the image branch BEFORE the `if (!body)` check (around line 373). Insert it as the first branch so image posts never reach the existing text/no-body paths:

```tsx
// Image posts: ImageCarousel fills the upper area, text panel below
if (post.media.length > 0) {
    return (
        <div className="flex h-full w-full flex-col">
            <div className="relative min-h-0 flex-1">
                <ImageCarousel
                    media={post.media}
                    duration={8000}
                    paused={paused}
                    blurMedia={blurMedia}
                    onRevealMedia={onRevealMedia ?? (() => {})}
                    onComplete={() => onReadyRef.current?.()}
                />
            </div>
            {post.body && (
                <div className="shrink-0 border-t border-white/10 bg-black/50 px-4 py-3 text-sm leading-snug text-white/80 backdrop-blur-sm">
                    <EmojiText text={post.body} emojis={post.emojis} />
                </div>
            )}
            {(post.reply_to || post.quoted_post || post.link_url) && (
                <div className="shrink-0 flex flex-col gap-2 border-t border-white/10 bg-black/50 px-4 py-3 backdrop-blur-sm">
                    {post.reply_to && (
                        <ContextPanel
                            icon={<Reply className="size-3.5" />}
                            author_name={post.reply_to.author_name}
                            author_avatar={post.reply_to.author_avatar}
                            author_handle={post.reply_to.author_handle}
                            emojis={post.emojis}
                            body={post.reply_to.body}
                            original_url={post.reply_to.original_url}
                            chip_mentions={post.reply_to.chip_mentions}
                        />
                    )}
                    {post.quoted_post && (
                        <ContextPanel
                            icon={<Quote className="size-3.5" />}
                            author_name={post.quoted_post.author_name}
                            author_avatar={post.quoted_post.author_avatar}
                            author_handle={post.quoted_post.author_handle}
                            emojis={post.emojis}
                            body={post.quoted_post.body}
                            original_url={post.quoted_post.original_url}
                            chip_mentions={post.quoted_post.chip_mentions}
                        />
                    )}
                    {post.link_url && (
                        <LinkCard
                            url={post.link_url}
                            title={post.link_title}
                            favicon={post.link_favicon}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
```

The `onReadyRef` is already defined near the top of `PostAnimator` and safely holds the latest `onReady` callback — using it here avoids adding `onReady` as a dep to any new effects.

- [ ] **Step 6.4: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests pass including the new PostAnimator tests.

```bash
npm run types:check
```

Expected: no type errors.

- [ ] **Step 6.5: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx resources/js/components/feed/PostAnimator.test.tsx
git commit -m "🎇 PostAnimator delegates to ImageCarousel for image posts (#136)"
```

---

## Self-Review Checklist

After all tasks:

- [ ] Run the complete test suite one final time: `npm test -- --run`
- [ ] Run type checks: `npm run types:check`
- [ ] Run linter: `npm run lint:check`
