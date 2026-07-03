# Post View Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three post-view issues: bare-domain URL detection (#101), exclude @mentions/#hashtags from the longest-word highlight (#100), and display hashtags as decorative rotated pills on the right side of posts (#102).

**Architecture:** Backend changes to `PostNormalizer` add bare-domain URL detection and hashtag extraction/stripping. Frontend changes update the `Post` type and add a hashtag strip to `PostAnimator`, plus filter `@`/`#` tokens from the longest-word selection in `PostAnimator` and `arc.ts`.

**Tech Stack:** PHP 8.4 / Laravel 13 / Pest (backend); React 19 / TypeScript / Vite / GSAP 3 / SplitText / Vitest (frontend); Biome for formatting/linting

---

## File Map

| File | Change |
|------|--------|
| `app/Services/Feed/PostNormalizer.php` | Extend `stripUrls`, `extractFirstLink`, `extractBody`; add `stripHashtags`; add `hashtags` field to Mastodon + Bluesky output |
| `tests/Unit/Feed/PostNormalizerTest.php` | New tests for bare-domain URLs and hashtag extraction/stripping |
| `resources/js/types/post.ts` | Add `hashtags: string[]` to `Post` interface |
| `resources/js/hooks/useFeedQueue.test.ts` | Add `hashtags: []` to `makePost` factory |
| `resources/js/lib/animations/templates/arc.ts` | Filter `@`/`#` tokens from longest-word selection |
| `resources/js/lib/animations/templates/arc.test.ts` | New — test longest-word filter |
| `resources/js/components/feed/PostAnimator.tsx` | Filter `@`/`#` from highlight selection; add hashtag strip; add `relative` to container |

---

## Task 1: Branch setup

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feature/post-view-improvements
```

---

## Task 2: Bare-domain URL detection (#101)

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Test: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write failing tests**

Add to the bottom of `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('strips bare domain urls with paths from bluesky post body', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'Check out fosstodon.org/users/foo for more',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('Check out for more')
        ->and($post['link_url'])->toBe('https://fosstodon.org/users/foo');
});

it('does not strip version strings that resemble bare urls', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'Upgraded to version 2.0/stable today',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('Upgraded to version 2.0/stable today')
        ->and($post['link_url'])->toBeNull();
});

it('strips bare domain url alongside scheme url and extracts scheme url first', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'See https://example.com and also github.com/foo/bar for details',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('See and also for details')
        ->and($post['link_url'])->toBe('https://example.com');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="bare domain"
```

Expected: FAILED — body still contains the URL, link_url is null.

- [ ] **Step 3: Implement bare-domain detection**

In `app/Services/Feed/PostNormalizer.php`, replace `stripUrls` and `extractFirstLink`:

```php
private function stripUrls(string $text): string
{
    $stripped = preg_replace(
        [
            '/https?:\/\/\S+/',
            '/(?<![.@\w])[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+\/\S+/',
        ],
        '',
        $text
    );

    return trim(preg_replace('/[ \t]{2,}/', ' ', $stripped));
}

private function extractFirstLink(string $text): ?string
{
    if (! preg_match(
        '/(?:https?:\/\/\S+|(?<![.@\w])[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9][a-zA-Z0-9-]*)+\/\S+)/',
        $text,
        $m
    )) {
        return null;
    }

    $url = rtrim($m[0], '.,;!?)>');

    if (! str_starts_with($url, 'http')) {
        $url = 'https://'.$url;
    }

    return $this->safeUrl($url) ?: null;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="bare domain\|version strings\|alongside scheme"
```

Expected: PASSED.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php
```

Expected: All existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🪳 Detect bare-domain URLs with paths in post normalizer (#101)"
```

---

## Task 3: Hashtag extraction and stripping (#102 — backend)

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write failing tests**

Add to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('extracts mastodon hashtags into hashtags array and strips them from body', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Loving the weather today #sunny #outdoors</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'tags' => [
            ['name' => 'sunny', 'url' => 'https://mastodon.example/tags/sunny'],
            ['name' => 'outdoors', 'url' => 'https://mastodon.example/tags/outdoors'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['hashtags'])->toBe(['sunny', 'outdoors'])
        ->and($post['body'])->toBe('Loving the weather today');
});

it('returns empty hashtags array when mastodon post has no tags', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hello world</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['hashtags'])->toBe([]);
});

it('extracts bluesky hashtags from post text and strips them from body', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'Great hike today #hiking #nature',
                '$type' => 'app.bsky.feed.post',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'handle' => 'alice.bsky.social',
                'displayName' => 'Alice',
                'avatar' => '',
            ],
            'embed' => null,
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['hashtags'])->toBe(['hiking', 'nature'])
        ->and($post['body'])->toBe('Great hike today');
});

it('lowercases mastodon hashtags', function () {
    $status = [
        'id' => '1',
        'content' => '<p>post #FooBar</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'tags' => [['name' => 'FooBar', 'url' => 'https://mastodon.example/tags/FooBar']],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['hashtags'])->toBe(['foobar']);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="hashtag"
```

Expected: FAILED — `hashtags` key does not exist.

- [ ] **Step 3: Add `stripHashtags` method to PostNormalizer**

Add after `stripUrls` in `app/Services/Feed/PostNormalizer.php`:

```php
private function stripHashtags(string $text): string
{
    $stripped = preg_replace('/#[a-zA-Z0-9_]+/', '', $text);

    return trim(preg_replace('/[ \t]{2,}/', ' ', $stripped));
}
```

- [ ] **Step 4: Update `extractBody` to strip hashtags**

Replace `extractBody` in `app/Services/Feed/PostNormalizer.php`:

```php
private function extractBody(string $html): string
{
    $withBreaks = str_replace(['</p>', '<br>', '<br/>'], "\n", $html);
    $text = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/\n{3,}/', "\n\n", $text);

    return $this->stripHashtags($this->stripUrls(trim($text)));
}
```

- [ ] **Step 5: Add `hashtags` field to `fromMastodon`**

In `fromMastodon`, add to the returned array (after `'emojis' => $emojis,`):

```php
'hashtags' => array_values(array_map(
    fn ($t) => strtolower($t['name']),
    $source['tags'] ?? []
)),
```

- [ ] **Step 6: Add `hashtags` field and hashtag stripping to `fromBluesky`**

In `fromBluesky`, before the `return` statement, add:

```php
preg_match_all('/#([a-zA-Z0-9_]+)/', $record['text'] ?? '', $tagMatches);
$hashtags = array_values(array_map('strtolower', $tagMatches[1]));
```

Update the `'body'` line in the returned array:

```php
'body' => $this->truncateBody($this->stripHashtags($this->stripUrls($record['text'])), config('feed.body_limit', 1024)),
```

Add to the returned array (after `'emojis' => [],`):

```php
'hashtags' => $hashtags,
```

- [ ] **Step 7: Run hashtag tests**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="hashtag"
```

Expected: PASSED.

- [ ] **Step 8: Run full normalizer test suite**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php
```

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Extract hashtags and strip from post body (#102 backend)"
```

---

## Task 4: Filter @mentions and #hashtags from longest-word selection (#100)

**Files:**
- Create: `resources/js/lib/animations/templates/arc.test.ts`
- Modify: `resources/js/lib/animations/templates/arc.ts`
- Modify: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Create failing test for arc template**

Create `resources/js/lib/animations/templates/arc.test.ts`:

```typescript
import { expect, it, vi } from 'vitest';
import { arc } from './arc';

function makeWords(texts: string[]) {
    return texts.map((t) => ({ textContent: t }));
}

function makeTl() {
    const tl = { set: vi.fn(), to: vi.fn() };
    tl.set.mockReturnValue(tl);
    tl.to.mockReturnValue(tl);
    return tl;
}

it('picks the longest non-mention word as the arc focal word', () => {
    const tl = makeTl();
    const words = makeWords(['@averylongmention', 'extraordinary', 'fox']);

    arc(tl as any, words as any, null as any);

    const focalCall = tl.set.mock.calls.find(([, opts]) => opts?.scale === 2.5);
    expect(focalCall?.[0].textContent).toBe('extraordinary');
});

it('picks the longest non-hashtag word as the arc focal word', () => {
    const tl = makeTl();
    const words = makeWords(['#superlonghashtag', 'wonderful', 'day']);

    arc(tl as any, words as any, null as any);

    const focalCall = tl.set.mock.calls.find(([, opts]) => opts?.scale === 2.5);
    expect(focalCall?.[0].textContent).toBe('wonderful');
});

it('falls back to full word list when all words are mentions or hashtags', () => {
    const tl = makeTl();
    const words = makeWords(['#longesthashtag', '@mention']);

    arc(tl as any, words as any, null as any);

    const focalCall = tl.set.mock.calls.find(([, opts]) => opts?.scale === 2.5);
    expect(focalCall?.[0].textContent).toBe('#longesthashtag');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- arc.test.ts
```

Expected: FAILED — `@averylongmention` is currently selected as focal.

- [ ] **Step 3: Update arc.ts to filter @/# tokens**

Replace the `longest` and `others` lines in `resources/js/lib/animations/templates/arc.ts`:

```typescript
import type { AnimationTemplate } from '../types';

export const arc: AnimationTemplate = (tl, words) => {
    if (words.length === 0) {
        return;
    }

    const contentWords = [...words].filter(
        (w) => !/^[@#]/.test(w.textContent ?? ''),
    );
    const wordPool = contentWords.length > 0 ? contentWords : words;

    const longest = wordPool.reduce((a, b) =>
        (a.textContent?.length ?? 0) >= (b.textContent?.length ?? 0) ? a : b,
    );
    const others = words.filter((w) => w !== longest);

    others.forEach((word, i) => {
        const angle = (i / others.length) * Math.PI * 2;
        const dx = Math.cos(angle) * 120;
        const dy = Math.sin(angle) * 80;
        tl.set(word, { opacity: 0, x: dx, y: dy, scale: 0.5 }, 0).to(
            word,
            {
                opacity: 1,
                x: 0,
                y: 0,
                scale: 1,
                duration: 0.35,
                ease: 'power2.out',
            },
            i * 0.1,
        );
    });

    tl.set(longest, { opacity: 0, scale: 2.5, filter: 'blur(8px)' }, 0).to(
        longest,
        {
            opacity: 1,
            scale: 1,
            filter: 'blur(0px)',
            duration: 0.5,
            ease: 'power3.out',
        },
        others.length * 0.1 + 0.15,
    );
};
```

- [ ] **Step 4: Run arc tests**

```bash
npm test -- arc.test.ts
```

Expected: PASSED (3 tests).

- [ ] **Step 5: Apply same filter in PostAnimator.tsx**

In `resources/js/components/feed/PostAnimator.tsx`, find the block around line 292–299:

```typescript
        // Apply highlight colour to the longest word — must happen after SplitText
        // rewrites the DOM, as it strips any inline colour spans.
        const highlight =
            colors?.highlight ?? postColors(post.author_handle).highlight;
        const longestEl = [...split.words].reduce((a, b) =>
            (b.textContent?.length ?? 0) > (a.textContent?.length ?? 0) ? b : a,
        );
        gsap.set(longestEl, { color: highlight });
```

Replace with:

```typescript
        // Apply highlight colour to the longest content word — must happen after SplitText
        // rewrites the DOM, as it strips any inline colour spans.
        // Exclude @mentions and #hashtags (which are stripped from body but may appear
        // in posts that haven't been re-fetched since the hashtag-strip was deployed).
        const highlight =
            colors?.highlight ?? postColors(post.author_handle).highlight;
        const contentWords = [...split.words].filter(
            (w) => !/^[@#]/.test(w.textContent ?? ''),
        );
        const wordPool = contentWords.length > 0 ? contentWords : [...split.words];
        const longestEl = wordPool.reduce((a, b) =>
            (b.textContent?.length ?? 0) > (a.textContent?.length ?? 0) ? b : a,
        );
        gsap.set(longestEl, { color: highlight });
```

- [ ] **Step 6: Run full JS test suite**

```bash
npm test
```

Expected: All 41+ tests pass.

- [ ] **Step 7: Commit**

```bash
git add resources/js/lib/animations/templates/arc.ts resources/js/lib/animations/templates/arc.test.ts resources/js/components/feed/PostAnimator.tsx
git commit -m "🪳 Exclude @mentions and #hashtags from longest-word selection (#100)"
```

---

## Task 5: Add hashtags to Post type and update test factory (#102 — type prep)

**Files:**
- Modify: `resources/js/types/post.ts`
- Modify: `resources/js/hooks/useFeedQueue.test.ts`

- [ ] **Step 1: Add `hashtags` to the Post interface**

In `resources/js/types/post.ts`, add `hashtags: string[];` after `emojis`:

```typescript
export interface Post {
    id: string;
    source: 'mastodon' | 'bluesky';
    source_handle: string;
    author_name: string;
    author_handle: string;
    author_avatar: string;
    author_banner: string | null;
    body: string;
    media: MediaAttachment[];
    created_at: string;
    original_url: string;
    link_url: string | null;
    link_title: string | null;
    link_favicon: string | null;
    reply_to: ReplyTo | null;
    quoted_post: QuotedPost | null;
    boosted_by: string | null;
    boosted_by_avatar: string | null;
    boosted_by_handle: string | null;
    boosted_by_created_at: string | null;
    emojis: Record<string, string>;
    hashtags: string[];
}
```

- [ ] **Step 2: Add `hashtags` to `makePost` in useFeedQueue.test.ts**

In `resources/js/hooks/useFeedQueue.test.ts`, add `hashtags: [],` to the `makePost` factory after `emojis: {},`:

```typescript
const makePost = (id: string, created_at?: string): Post => ({
    id,
    source: 'mastodon',
    source_handle: '',
    author_name: 'Test',
    author_handle: '@test@example.com',
    author_avatar: '',
    author_banner: null,
    body: 'hello',
    media: [],
    created_at: created_at ?? new Date().toISOString(),
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
});
```

- [ ] **Step 3: Run type check and tests**

```bash
npm run types:check && npm test
```

Expected: No type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add resources/js/types/post.ts resources/js/hooks/useFeedQueue.test.ts
git commit -m "🔄 Add hashtags field to Post type (#102)"
```

---

## Task 6: Render hashtag strip in PostAnimator (#102 — frontend UI)

**Files:**
- Modify: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Add `relative` to the container and render the hashtag strip**

In `resources/js/components/feed/PostAnimator.tsx`, find the outer container div (around line 418):

```tsx
        <div
            ref={containerRef}
            className="flex h-full w-full items-center justify-center p-8 text-center"
        >
```

Replace with:

```tsx
        <div
            ref={containerRef}
            className="relative flex h-full w-full items-center justify-center p-8 text-center"
        >
```

Then, just before the closing `</div>` of that container (after the media/link card section and the `return null`), add the hashtag strip. Find the closing of the entire return statement — the last `</div>` before `);` — and add the strip inside the outer container, just before it closes:

```tsx
            {post.hashtags.length > 0 && (
                <div
                    aria-hidden="true"
                    className="absolute right-2 top-0 flex h-full flex-col items-center justify-center gap-2 overflow-hidden"
                >
                    {post.hashtags.map((tag) => (
                        <span
                            key={tag}
                            className="rotate-90 rounded-full bg-white/10 px-2 py-0.5 text-[0.6rem] whitespace-nowrap"
                            style={{ color: colors?.text ?? 'white' }}
                        >
                            #{tag}
                        </span>
                    ))}
                </div>
            )}
```

The `aria-hidden="true"` marks the strip as decorative (hashtags are already present in the post body before stripping, and this is a visual-only feed display).

- [ ] **Step 2: Run type check**

```bash
npm run types:check
```

Expected: No errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx
git commit -m "🎇 Render hashtag strip on right side of posts (#102)"
```

---

## Task 7: File the hashtag interactivity follow-up issue

- [ ] **Step 1: Create GitHub issue**

```bash
gh issue create \
  --title "Hashtag interactivity (filter feed / link to platform)" \
  --body "Hashtags are currently displayed as decorative rotated pills on the right side of posts (#102). As a follow-up, tapping a hashtag should either filter the feed to posts with that tag, or link out to the platform's hashtag page. Needs UX decision on which behaviour is preferred." \
  --label "🪄feature,area: frontend,area: feed"
```

---

## Task 8: Open PR

- [ ] **Step 1: Push branch and create draft PR**

```bash
git push -u origin feature/post-view-improvements
gh pr create --draft \
  --title "Post view improvements (#100, #101, #102)" \
  --body "$(cat <<'EOF'
## Summary

- **#101** Bare-domain URLs with paths (e.g. `fosstodon.org/users/foo`) are now detected, stripped from body text, and extracted as link cards. Version strings like `2.0/stable` are not matched.
- **#100** `@mentions` and `#hashtags` are excluded from the longest-word highlight and arc animation focal-word selection.
- **#102** Hashtags are extracted from posts (Mastodon: from `tags[]`; Bluesky: from text), stripped from the body, and displayed as decorative rotated pills on the right side of each post.

## Test plan

- [ ] PHP: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php` — all pass
- [ ] JS: `npm test` — all pass
- [ ] Manual: open the feed, verify posts with hashtags show the strip; verify no regression on posts without hashtags
- [ ] Manual: verify a Bluesky post with a bare domain URL shows a link card
EOF
)"
```
