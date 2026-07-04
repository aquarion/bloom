# Moderation Label Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the author-level CW overlay to show the specific label, the author identity chip, and correct attribution phrasing; fix keyboard shortcuts being blocked by CW overlays.

**Architecture:** Backend threads label source (`self`/`external`) through `PostNormalizer`; frontend `CwOverlay` gains an author chip and two phrasing variants. Keyboard shortcut fix resolves the runtime blocking of `j`/`k` during overlay display.

**Tech Stack:** PHP (Laravel/Pest), TypeScript/React (Vitest/RTL), GSAP

---

## File Map

| File | Change |
|---|---|
| `app/Services/Feed/PostNormalizer.php` | Add moderation label map, raw fallback, `src` extraction, `cw_label_source` |
| `tests/Unit/Feed/PostNormalizerTest.php` | New tests for label map, source resolution; update "Content warning" test |
| `resources/js/types/post.ts` | Add `cw_label_source: 'self' \| 'external' \| null` |
| `resources/js/components/feed/PostContent.tsx` | `CwOverlay` author chip + source phrasing; `onCwOverlayActive` callback |
| `resources/js/components/feed/PostContent.test.tsx` | New: overlay phrasing + chip tests |
| `resources/js/pages/feed.tsx` | Gate `j`/`k` shortcuts via `cwOverlayActive` ref |
| `resources/js/pages/feed.test.tsx` | Keyboard shortcut tests; add `cw_label_source` to fixture |
| `resources/js/pages/welcome.test.tsx` | Add `cw_label_source` to fixture |
| `resources/js/hooks/useFeedQueue.test.ts` | Add `cw_label_source` to fixture |
| `resources/js/hooks/useWelcomeQueue.test.ts` | Add `cw_label_source` to fixture |
| `resources/js/components/feed/PostAnimator.test.tsx` | Add `cw_label_source` to fixture |

---

### Task 1: Backend — moderation label map and raw fallback

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php` (method `blueskyLabels`, ~line 631)
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write failing tests for moderation label map**

Add to `tests/Unit/Feed/PostNormalizerTest.php` after the existing label tests (around line 1870):

```php
it('maps bluesky rude label to rude content', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [['val' => 'rude']],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_text'])->toBe('rude content');
});

it('maps bluesky threat label to threatening content', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [['val' => 'threat']],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_text'])->toBe('threatening content');
});

it('maps bluesky spam label to spam', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [['val' => 'spam']],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_text'])->toBe('spam');
});

it('falls back to raw label value for unknown bluesky labels', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [['val' => 'custom-warning']],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_text'])->toBe('custom-warning');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="maps bluesky rude|maps bluesky threat|maps bluesky spam|falls back to raw"
```

Expected: FAIL — assertions expect mapped values, code returns "Content warning".

- [ ] **Step 3: Update `blueskyLabels()` with the moderation map and raw fallback**

In `app/Services/Feed/PostNormalizer.php`, replace the `$resolveCwText` closure (lines 631–640):

```php
        $moderationLabelMap = [
            'rude'          => 'rude content',
            'threat'        => 'threatening content',
            'intolerant'    => 'intolerant content',
            'self-harm'     => 'self-harm content',
            'spam'          => 'spam',
            'impersonation' => 'impersonation',
            'misleading'    => 'misleading content',
        ];

        $resolveCwText = function (array $l) use ($adultLabels, $graphicLabels, $moderationLabelMap): ?string {
            if (array_intersect($l, $adultLabels)) {
                return 'Adult content';
            }
            if (array_intersect($l, $graphicLabels)) {
                return 'Graphic media';
            }
            foreach ($l as $label) {
                if (isset($moderationLabelMap[$label])) {
                    return $moderationLabelMap[$label];
                }
            }

            return ! empty($l) ? $l[0] : null;
        };
```

- [ ] **Step 4: Update the "Content warning" test to expect raw value**

In `PostNormalizerTest.php`, find the test "maps unknown bluesky content label to Content warning generic fallback" (around line 1836) and update:

```php
it('falls back to raw label value for unknown bluesky content labels', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [['val' => 'custom-warning']],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_text'])->toBe('custom-warning')
        ->and($post['sensitive_media'])->toBeFalse();
});
```

(This replaces the existing test body — just update the `expect` assertion from `'Content warning'` to `'custom-warning'` and rename the test.)

- [ ] **Step 5: Run the full label test suite**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="label|cw_text|sensitive"
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🪳 Map known moderation labels and fall back to raw label value"
```

---

### Task 2: Backend — `cw_label_source` via `src` extraction

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write failing tests for source resolution**

Add to `PostNormalizerTest.php`:

```php
it('sets cw_label_source to self when author label src matches author did', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => [
                'did' => 'did:plc:authorabc',
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/av.jpg',
                'labels' => [['val' => 'porn', 'src' => 'did:plc:authorabc']],
            ],
            'labels' => [],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_label_source'])->toBe('self')
        ->and($post['cw_is_author_level'])->toBeTrue();
});

it('sets cw_label_source to external when author label src does not match author did', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => [
                'did' => 'did:plc:authorabc',
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/av.jpg',
                'labels' => [['val' => 'rude', 'src' => 'did:plc:ar7c4by46qjdydhdevvrndac']],
            ],
            'labels' => [],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_label_source'])->toBe('external')
        ->and($post['cw_is_author_level'])->toBeTrue();
});

it('sets cw_label_source to external when any author label has a different src', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => [
                'did' => 'did:plc:authorabc',
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/av.jpg',
                'labels' => [
                    ['val' => 'porn', 'src' => 'did:plc:authorabc'],
                    ['val' => 'rude', 'src' => 'did:plc:ar7c4by46qjdydhdevvrndac'],
                ],
            ],
            'labels' => [],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_label_source'])->toBe('external');
});

it('sets cw_label_source to null when cw is post-level not author-level', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'some text', 'createdAt' => '2024-01-01T00:00:00.000Z'],
            'author' => [
                'did' => 'did:plc:authorabc',
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/av.jpg',
                'labels' => [],
            ],
            'labels' => [['val' => 'gore', 'src' => 'did:plc:authorabc']],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['cw_label_source'])->toBeNull()
        ->and($post['cw_is_author_level'])->toBeFalse();
});

it('sets cw_label_source to null for mastodon posts', function () {
    $status = [
        'id' => '123',
        'content' => '<p>hello</p>',
        'spoiler_text' => 'CW: politics',
        'created_at' => '2024-01-01T00:00:00.000Z',
        'account' => [
            'display_name' => 'Alice',
            'acct' => 'alice@mastodon.social',
            'avatar' => 'https://example.com/av.jpg',
            'header' => null,
            'emojis' => [],
        ],
        'media_attachments' => [],
        'tags' => [],
        'mentions' => [],
        'reblog' => null,
        'in_reply_to_id' => null,
        'sensitive' => false,
        'emojis' => [],
        'card' => null,
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.social');

    expect($post['cw_label_source'])->toBeNull();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="cw_label_source"
```

Expected: FAIL — `cw_label_source` key does not exist in the returned array.

- [ ] **Step 3: Add source resolution to `blueskyLabels()`**

In `app/Services/Feed/PostNormalizer.php`, after the `$cwIsAuthorLevel` line (around line 645), add:

```php
        $cwLabelSource = null;
        if ($cwIsAuthorLevel) {
            $authorDid = $post['author']['did'] ?? null;
            $cwLabelSource = 'self';
            foreach ($post['author']['labels'] ?? [] as $label) {
                $val = $label['val'] ?? '';
                if ($val === '' || str_starts_with($val, '!')) {
                    continue;
                }
                if (($label['src'] ?? '') !== $authorDid) {
                    $cwLabelSource = 'external';
                    break;
                }
            }
        }
```

Then add `'cw_label_source' => $cwLabelSource` to the returned array:

```php
        return [
            'cw_text' => $cwText,
            'cw_is_author_level' => $cwIsAuthorLevel,
            'cw_label_source' => $cwLabelSource,
            'sensitive_media' => ! empty(array_intersect($labels, $mediaLabels)),
        ];
```

- [ ] **Step 4: Thread `cw_label_source` through `fromBluesky()` and `fromMastodon()`**

In `fromBluesky()` (around line 132), add to the returned array:

```php
            'cw_label_source' => $labelData['cw_label_source'],
```

In `fromMastodon()` (around line 68), add to the returned array:

```php
            'cw_label_source' => null,
```

- [ ] **Step 5: Run the full test suite**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Add cw_label_source field via AT Protocol label src extraction"
```

---

### Task 3: Frontend Post type and fixture updates

**Files:**
- Modify: `resources/js/types/post.ts`
- Modify: `resources/js/pages/feed.test.tsx`
- Modify: `resources/js/pages/welcome.test.tsx`
- Modify: `resources/js/hooks/useFeedQueue.test.ts`
- Modify: `resources/js/hooks/useWelcomeQueue.test.ts`
- Modify: `resources/js/components/feed/PostAnimator.test.tsx`

- [ ] **Step 1: Add `cw_label_source` to the `Post` type**

In `resources/js/types/post.ts`, after line 63 (`cw_is_author_level: boolean;`):

```typescript
    cw_label_source: 'self' | 'external' | null;
```

- [ ] **Step 2: Run tests to see type errors**

```bash
npm test -- --run 2>&1 | grep -E "error|Error|cw_label"
```

Expected: TypeScript errors in all files that construct a `Post` object without `cw_label_source`.

- [ ] **Step 3: Add `cw_label_source: null` to all `makePost` fixtures**

`resources/js/pages/feed.test.tsx` — in `makePost` after `cw_is_author_level: false`:
```typescript
    cw_label_source: null,
```

`resources/js/pages/welcome.test.tsx` — same location in its `makePost`:
```typescript
    cw_label_source: null,
```

`resources/js/hooks/useFeedQueue.test.ts` — in `makePost` after `cw_is_author_level: false`:
```typescript
    cw_label_source: null,
```

`resources/js/hooks/useWelcomeQueue.test.ts` — in the post literal after `cw_is_author_level: false`:
```typescript
    cw_label_source: null,
```

`resources/js/components/feed/PostAnimator.test.tsx` — in `makePost` after `cw_is_author_level: false`:
```typescript
    cw_label_source: null,
```

- [ ] **Step 4: Run tests to confirm type errors are resolved**

```bash
npm test -- --run
```

Expected: all existing tests PASS (no new failures).

- [ ] **Step 5: Commit**

```bash
git add resources/js/types/post.ts resources/js/pages/feed.test.tsx resources/js/pages/welcome.test.tsx resources/js/hooks/useFeedQueue.test.ts resources/js/hooks/useWelcomeQueue.test.ts resources/js/components/feed/PostAnimator.test.tsx
git commit -m "🎇 Add cw_label_source to Post type and update test fixtures"
```

---

### Task 4: Frontend — author chip in CW overlay

**Files:**
- Create: `resources/js/components/feed/PostContent.test.tsx`
- Modify: `resources/js/components/feed/PostContent.tsx`

- [ ] **Step 1: Create `PostContent.test.tsx` with failing tests**

Create `resources/js/components/feed/PostContent.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { PostContent } from './PostContent';

vi.mock('@/components/feed/PostAnimator', () => ({
    PostAnimator: ({ onReady }: { onReady?: () => void }) => {
        onReady?.();
        return <div data-testid="post-animator" />;
    },
}));

vi.mock('@/components/feed/AuthorChip', () => ({
    AuthorChip: ({
        name,
        account,
    }: {
        name: string;
        account: string;
        avatar: string;
        emojis: Record<string, string>;
    }) => <div data-testid="author-chip" data-name={name} data-account={account} />,
}));

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
    ...overrides,
});

describe('PostContent — author-level CW overlay', () => {
    it('shows author chip with author name and handle for external author-level CW', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'rude content',
                    cw_is_author_level: true,
                    cw_label_source: 'external',
                })}
                cwBehavior="blur"
            />,
        );

        const chip = screen.getByTestId('author-chip');
        expect(chip).toBeInTheDocument();
        expect(chip).toHaveAttribute('data-name', 'Alice');
        expect(chip).toHaveAttribute('data-account', '@alice.bsky.social');
    });

    it('shows "has been labelled as posting" phrasing for external source', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'rude content',
                    cw_is_author_level: true,
                    cw_label_source: 'external',
                })}
                cwBehavior="blur"
            />,
        );

        expect(
            screen.getByText(/has been labelled as posting rude content/i),
        ).toBeInTheDocument();
    });

    it('shows "marks their posts as" phrasing for self source', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'Adult content',
                    cw_is_author_level: true,
                    cw_label_source: 'self',
                })}
                cwBehavior="blur"
            />,
        );

        expect(
            screen.getByText(/marks their posts as adult content/i),
        ).toBeInTheDocument();
    });

    it('shows author chip for self source', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'Adult content',
                    cw_is_author_level: true,
                    cw_label_source: 'self',
                })}
                cwBehavior="blur"
            />,
        );

        expect(screen.getByTestId('author-chip')).toBeInTheDocument();
    });

    it('does not show author chip for post-level CW', () => {
        render(
            <PostContent
                post={makePost({
                    cw_text: 'Graphic media',
                    cw_is_author_level: false,
                    cw_label_source: null,
                })}
                cwBehavior="blur"
            />,
        );

        expect(screen.queryByTestId('author-chip')).not.toBeInTheDocument();
        expect(screen.getByText('Graphic media')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- PostContent.test --run
```

Expected: FAIL — `author-chip` not found, phrasing text not found.

- [ ] **Step 3: Update `CwOverlay` in `PostContent.tsx`**

Add the `AuthorChip` import at the top of the file (after the existing imports):

```typescript
import { AuthorChip } from './AuthorChip';
```

Replace the entire `CwOverlay` function and update `PostContent` to pass the new props:

function CwOverlay({
    cwText,
    onReveal,
    isAuthorLevel,
    labelSource,
    authorName,
    authorHandle,
    authorAvatar,
    authorEmojis,
}: {
    cwText: string;
    onReveal: () => void;
    isAuthorLevel: boolean;
    labelSource: 'self' | 'external' | null;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    authorEmojis: Record<string, string>;
}) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 px-8 text-center text-white">
            {isAuthorLevel ? (
                <>
                    <p className="mb-3 max-w-sm text-base">This author</p>
                    <div className="mb-3 w-full max-w-xs">
                        <AuthorChip
                            name={authorName}
                            account={authorHandle}
                            avatar={authorAvatar}
                            emojis={authorEmojis}
                        />
                    </div>
                    <p className="mb-1 max-w-sm text-base">
                        {labelSource === 'self'
                            ? `marks their posts as ${cwText.toLowerCase()}`
                            : `has been labelled as posting ${cwText.toLowerCase()}`}
                    </p>
                    <p className="mb-4 max-w-sm text-sm text-white/60">
                        Revealing will unhide all their posts for this session
                    </p>
                </>
            ) : (
                <p className="mb-4 max-w-sm text-base">{cwText}</p>
            )}
            <button
                type="button"
                onClick={onReveal}
                className="rounded-full bg-white/20 px-4 py-1.5 text-sm hover:bg-white/30"
            >
                {isAuthorLevel ? 'Show author' : 'Show anyway'}
            </button>
        </div>
    );
}
```

Then in `PostContent`, pass the new props to `CwOverlay`:

```typescript
            {showCwOverlay && cwText !== null && (
                <CwOverlay
                    cwText={cwText}
                    onReveal={revealCw}
                    isAuthorLevel={isAuthorLevel}
                    labelSource={post.cw_label_source}
                    authorName={post.author_name}
                    authorHandle={post.author_handle}
                    authorAvatar={post.author_avatar}
                    authorEmojis={post.emojis}
                />
            )}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- PostContent.test --run
```

Expected: all PASS.

- [ ] **Step 5: Run full frontend test suite**

```bash
npm test -- --run
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add resources/js/components/feed/PostContent.tsx resources/js/components/feed/PostContent.test.tsx
git commit -m "🖼️ Show author chip and label source phrasing in CW overlay"
```

---

### Task 5: Bug fix — keyboard shortcuts blocked by CW overlay

**Files:**
- Modify: `resources/js/components/feed/PostContent.tsx`
- Modify: `resources/js/pages/feed.tsx`
- Modify: `resources/js/pages/feed.test.tsx`

**Context:** Pressing `j`/`k` while any CW overlay is showing fails to navigate. The root cause is that `onReady` is suppressed while a post-level CW overlay is active, leaving `animationReady = false`. The exact mechanism by which this blocks `handleAdvance`/`handleGoBack` requires runtime investigation. The fix is to give `feed.tsx` visibility into whether a blocking CW overlay is active, so `j`/`k` can be handled explicitly (for post-level: advance without requiring reveal; for author-level: always unblocked since the timer runs through them).

- [ ] **Step 1: Write failing test for `j` navigating past a CW overlay**

First, update the PostContent mock in `feed.test.tsx` from a constant arrow function to a `vi.fn()` so it can be inspected and reconfigured:

```typescript
// Replace the existing vi.mock for PostContent:
vi.mock('@/components/feed/PostContent', () => ({
    PostContent: vi.fn(() => null),
}));
```

Add the following import at the top of the test file:

```typescript
import { act } from '@testing-library/react';
import { PostContent } from '@/components/feed/PostContent';
```

Add the test inside `describe('Feed')`:

```typescript
    it('pressing j fires handleAdvance even when a CW overlay is active', () => {
        const { gsap } = await import('gsap');
        vi.mocked(gsap.timeline).mockClear();

        // Capture the onCwOverlayActive callback fed to PostContent
        let cwActiveCallback: ((active: boolean) => void) | undefined;
        vi.mocked(PostContent).mockImplementation(
            ({ onCwOverlayActive }: { onCwOverlayActive?: (active: boolean) => void }) => {
                cwActiveCallback = onCwOverlayActive;
                return null;
            },
        );

        render(<Feed {...defaultProps} initialPosts={[makePost('1'), makePost('2')]} />);

        // Simulate overlay becoming active
        act(() => cwActiveCallback?.(true));

        fireEvent.keyDown(window, { key: 'j' });

        // handleAdvance should have triggered the GSAP timeline regardless of overlay state
        expect(gsap.timeline).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- feed.test --run
```

Expected: FAIL.

- [ ] **Step 3: Add `onCwOverlayActive` prop to `PostContent`**

In `resources/js/components/feed/PostContent.tsx`, add to the props:

```typescript
    onCwOverlayActive?: (active: boolean) => void;
```

Add to the `PostContent` function signature and fire the callback when `showCwOverlay` changes:

```typescript
    const onCwOverlayActiveRef = useRef(onCwOverlayActive);
    useLayoutEffect(() => {
        onCwOverlayActiveRef.current = onCwOverlayActive;
    });

    useLayoutEffect(() => {
        // Only fire for post-level overlays (author-level doesn't block the timer)
        if (!isAuthorLevel) {
            onCwOverlayActiveRef.current?.(showCwOverlay);
        }
    }, [showCwOverlay, isAuthorLevel]);
```

- [ ] **Step 4: Wire `onCwOverlayActive` in `feed.tsx`**

In `resources/js/pages/feed.tsx`, add a ref to track whether a blocking CW overlay is active:

```typescript
    const cwOverlayActiveRef = useRef(false);
```

Pass the callback to `PostContent`:

```typescript
                    <PostContent
                        ...
                        onCwOverlayActive={(active) => {
                            cwOverlayActiveRef.current = active;
                        }}
                    />
```

Update `handleAdvance` to proceed regardless of overlay state (the ref replaces any gating that existed). If the investigation in step 5 reveals a specific code path blocked by `animationReady`, patch that here. One known safe fix: ensure `handleAdvance` does not bail early when `animationReady` is false. If the block is in the GSAP guard (`!bg || !content || ...`), no change is needed there.

- [ ] **Step 5: Investigate and fix the actual blocking mechanism**

Run the app with a post that has an author-level moderation label, open DevTools, press `j` and `k`. Check:

1. Does `handleAdvance` get called? Add `console.log` at the start.
2. Does the GSAP guard (`!bg || !content || Date.now() < transitionEndRef.current`) return early?
3. Does GSAP's `.call()` callback fire?

Based on findings, apply the minimal fix. Common candidates:

- If `transitionEndRef.current` is stuck in the future: check whether a prior advance set it and the 700ms window hasn't expired.
- If GSAP `.call()` doesn't fire because animation is killed: ensure the GSAP timeline isn't being killed by the CW overlay re-render.
- If `handleAdvance` is not called at all: check whether `useKeyboardShortcuts` is picking up the key event (may be a focus trap or `isContentEditable` false positive on the overlay button).

Apply the fix based on findings.

- [ ] **Step 6: Run tests**

```bash
npm test -- --run
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add resources/js/components/feed/PostContent.tsx resources/js/pages/feed.tsx resources/js/pages/feed.test.tsx
git commit -m "🪳 Fix j/k keyboard shortcuts blocked by CW overlay"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suites**

```bash
./vendor/bin/pest && npm test -- --run
```

Expected: all PASS. Note the current passing count before starting (check with `./vendor/bin/pest --compact`).

- [ ] **Step 2: Open a Bluesky post with an author moderation label**

Visit `https://bsky.app/profile/mrmoth.eurosky.social/post/3mpt7wbanmk2l` in the staging feed. With `cwBehavior = blur`, the overlay should show:

```
This author
[ avatar ]  mrmoth
            @mrmoth.eurosky.social
has been labelled as posting rude content
[Revealing will unhide all their posts for this session]
[Show author]
```

- [ ] **Step 3: Verify keyboard shortcuts work**

With the overlay visible, press `j` and `k` — the feed should navigate to the next/previous post.

- [ ] **Step 4: Commit**

No code change — this is the verification step. If issues found, fix and commit before proceeding.
