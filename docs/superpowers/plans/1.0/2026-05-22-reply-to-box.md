# Reply-To Box: Author Identity & AuthorChip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the reply-to context box with avatar, display name, and a link to the original post; extract a shared `AuthorChip` component used by both the reply-to panel and the bottom Attribution bar.

**Architecture:** The backend normalizers are extended to pass three new fields (`author_name`, `author_avatar`, `original_url`) through the `reply_to` payload. On the frontend, a new `AuthorChip` component (avatar + bold name + muted subtext) is shared between the reply-to panel (now an `<a>` link) and the refactored `Attribution` component.

**Tech Stack:** PHP (Pest tests), TypeScript, React, Tailwind CSS

---

## File Map

| Action | Path |
|--------|------|
| Modify | `app/Services/Feed/PostNormalizer.php` |
| Modify | `tests/Unit/Feed/PostNormalizerTest.php` |
| Modify | `resources/js/types/post.ts` |
| Create | `resources/js/components/feed/AuthorChip.tsx` |
| Modify | `resources/js/components/feed/Attribution.tsx` |
| Modify | `resources/js/components/feed/PostAnimator.tsx` |

---

### Task 1: Mastodon reply_to — tests and implementation

**Files:**
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`
- Modify: `app/Services/Feed/PostNormalizer.php`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('includes author identity and url in mastodon reply_to', function () {
    $parent = [
        'url' => 'https://mastodon.social/@original/456',
        'content' => '<p>This is the parent post body</p>',
        'account' => [
            'display_name' => 'Original User',
            'acct' => 'original',
            'avatar' => 'https://mastodon.social/avatars/original.jpg',
        ],
    ];

    $status = [
        'id' => '789',
        'content' => '<p>Reply text</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/789',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', $parent);

    expect($post['reply_to'])->toBe([
        'author_name' => 'Original User',
        'author_handle' => '@original@mastodon.social',
        'author_avatar' => 'https://mastodon.social/avatars/original.jpg',
        'original_url' => 'https://mastodon.social/@original/456',
        'body' => 'This is the parent post body',
    ]);
});

it('falls back to acct when mastodon reply_to parent has no display_name', function () {
    $parent = [
        'url' => 'https://mastodon.social/@noname/1',
        'content' => '<p>body</p>',
        'account' => ['display_name' => '', 'acct' => 'noname', 'avatar' => ''],
    ];

    $status = [
        'id' => '2',
        'content' => '<p>reply</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/2',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', $parent);

    expect($post['reply_to']['author_name'])->toBe('noname');
});

it('sets mastodon reply_to original_url to empty string when parent url is non-http', function () {
    $parent = [
        'url' => 'javascript:alert(1)',
        'content' => '<p>body</p>',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
    ];

    $status = [
        'id' => '3',
        'content' => '<p>reply</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/3',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', $parent);

    expect($post['reply_to']['original_url'])->toBe('');
});

it('returns null reply_to when mastodon parentStatus is null', function () {
    $status = [
        'id' => '4',
        'content' => '<p>standalone post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/4',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['reply_to'])->toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter "mastodon reply_to"
```

Expected: 3 failures — tests asserting `author_name`, `author_avatar`, `original_url` keys that don't exist yet. The null test should already pass.

- [ ] **Step 3: Update `mastodonReplyTo()` in `PostNormalizer.php`**

Replace the existing `mastodonReplyTo` method (around line 78–92):

```php
private function mastodonReplyTo(?array $parent, string $fallbackHost): ?array
{
    if ($parent === null) {
        return null;
    }

    $parentHost = parse_url($parent['url'] ?? '', PHP_URL_HOST) ?? $fallbackHost;

    return [
        'author_name' => $parent['account']['display_name'] ?: $parent['account']['acct'],
        'author_handle' => "@{$parent['account']['acct']}@{$parentHost}",
        'author_avatar' => $this->safeUrl($parent['account']['avatar'] ?? ''),
        'original_url' => $this->safeUrl($parent['url'] ?? ''),
        'body' => $this->truncateBody(
            $this->extractBody($parent['content'])
        ),
    ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter "mastodon reply_to"
```

Expected: 4 passing.

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add tests/Unit/Feed/PostNormalizerTest.php app/Services/Feed/PostNormalizer.php
git commit -m "🪲 Add author identity and url to mastodon reply_to payload"
```

---

### Task 2: Bluesky reply_to — tests and implementation

**Files:**
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`
- Modify: `app/Services/Feed/PostNormalizer.php`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('includes author identity and url in bluesky reply_to', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/reply123',
            'record' => ['text' => 'reply text', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/parent456',
                'record' => ['text' => 'parent body text'],
                'author' => [
                    'displayName' => 'Bob',
                    'handle' => 'bob.bsky.social',
                    'avatar' => 'https://cdn.bsky.app/bob.jpg',
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to'])->toBe([
        'author_name' => 'Bob',
        'author_handle' => '@bob.bsky.social',
        'author_avatar' => 'https://cdn.bsky.app/bob.jpg',
        'original_url' => 'https://bsky.app/profile/bob.bsky.social/post/parent456',
        'body' => 'parent body text',
    ]);
});

it('falls back to handle when bluesky reply_to parent has no displayName', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'reply', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/abc',
                'record' => ['text' => 'body'],
                'author' => ['displayName' => '', 'handle' => 'noname.bsky.social', 'avatar' => ''],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to']['author_name'])->toBe('noname.bsky.social');
});

it('returns null reply_to when bluesky parent has no record text', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'reply', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => ''],
            'embed' => null,
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:xyz/app.bsky.feed.post/abc',
                'record' => [],
                'author' => ['displayName' => 'Bob', 'handle' => 'bob.bsky.social', 'avatar' => ''],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to'])->toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter "bluesky reply_to"
```

Expected: 2 failures — `author_name`, `author_avatar`, `original_url` keys missing. The null-record test should already pass.

- [ ] **Step 3: Update `blueskyReplyTo()` in `PostNormalizer.php`**

Replace the existing `blueskyReplyTo` method (around line 94–106):

```php
private function blueskyReplyTo(?array $parent): ?array
{
    if ($parent === null || ! isset($parent['record']['text'])) {
        return null;
    }

    $handle = $parent['author']['handle'] ?? '';

    return [
        'author_name' => ($parent['author']['displayName'] ?? '') ?: $handle,
        'author_handle' => '@'.$handle,
        'author_avatar' => $this->safeUrl($parent['author']['avatar'] ?? ''),
        'original_url' => $this->blueskyPostUrl($handle, $parent['uri'] ?? ''),
        'body' => $this->truncateBody($parent['record']['text']),
    ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter "bluesky reply_to"
```

Expected: 3 passing.

- [ ] **Step 5: Run the full test suite**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/Unit/Feed/PostNormalizerTest.php app/Services/Feed/PostNormalizer.php
git commit -m "🪲 Add author identity and url to bluesky reply_to payload"
```

---

### Task 3: Extend TypeScript ReplyTo type

**Files:**
- Modify: `resources/js/types/post.ts`

- [ ] **Step 1: Update the `ReplyTo` interface**

In `resources/js/types/post.ts`, replace the existing `ReplyTo` interface:

```typescript
export interface ReplyTo {
    author_name: string;
    author_handle: string;
    author_avatar: string;
    original_url: string;
    body: string;
}
```

- [ ] **Step 2: Run the TypeScript type-checker**

```bash
npx tsc --noEmit
```

Expected: errors in `PostAnimator.tsx` where `reply_to.author_name`, `reply_to.author_avatar`, and `reply_to.original_url` don't exist yet in usage — these confirm the type is live. (If there are no errors, the new fields are additive and that's fine too.)

- [ ] **Step 3: Commit**

```bash
git add resources/js/types/post.ts
git commit -m "🔄 Extend ReplyTo type with author identity and original_url fields"
```

---

### Task 4: Create the AuthorChip component

**Files:**
- Create: `resources/js/components/feed/AuthorChip.tsx`

- [ ] **Step 1: Create `AuthorChip.tsx`**

```tsx
import type { ReactNode } from "react";
import { EmojiText } from "@/lib/emoji-text";

export function AuthorChip({
    name,
    avatar,
    emojis,
    subtext,
}: {
    name: string;
    avatar: string;
    emojis: Record<string, string>;
    subtext?: ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
            <img
                src={avatar}
                alt={name}
                className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">
                    <EmojiText text={name} emojis={emojis} />
                </p>
                {subtext !== undefined && (
                    <p className="truncate text-[0.65rem] text-white/50">{subtext}</p>
                )}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/feed/AuthorChip.tsx
git commit -m "✨ Add AuthorChip component for shared author identity display"
```

---

### Task 5: Refactor Attribution to use AuthorChip

**Files:**
- Modify: `resources/js/components/feed/Attribution.tsx`

- [ ] **Step 1: Refactor `Attribution.tsx`**

Replace the entire file content:

```tsx
import { EmojiText } from "@/lib/emoji-text";
import { AuthorChip } from "./AuthorChip";
import type { Post } from "@/types/post";

function timeSince(dateStr: string): string {
    const seconds = Math.floor(
        (Date.now() - new Date(dateStr).getTime()) / 1000,
    );

    if (seconds < 60) {
        return "just now";
    }

    const minutes = Math.floor(seconds / 60);

    if (minutes < 60) {
        return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);

    return `${days}d ago`;
}

export function Attribution({ post }: { post: Post }) {
    const subtext = (
        <>
            {post.boosted_by && (
                <>
                    {post.source === "mastodon" ? "Boosted" : "Reposted"} by{" "}
                    <EmojiText text={post.boosted_by} emojis={post.emojis} />
                    {" · "}
                </>
            )}
            Posted {timeSince(post.created_at)} · tap to open ↗
        </>
    );

    return (
        <a
            href={post.original_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
            <AuthorChip
                name={post.author_name}
                avatar={post.author_avatar}
                emojis={post.emojis}
                subtext={subtext}
            />
        </a>
    );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Visually verify Attribution still looks correct**

Start the dev server (`npm run dev` or `pnpm dev`) and open the feed in the browser. Confirm the bottom author bar looks identical to before — avatar, bold name, muted "Posted X ago · tap to open ↗" line.

- [ ] **Step 4: Commit**

```bash
git add resources/js/components/feed/Attribution.tsx
git commit -m "🔄 Refactor Attribution to use AuthorChip"
```

---

### Task 6: Update the PostAnimator reply-to panel

**Files:**
- Modify: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Add AuthorChip import**

At the top of `resources/js/components/feed/PostAnimator.tsx`, add:

```tsx
import { AuthorChip } from "./AuthorChip";
```

- [ ] **Step 2: Replace the reply_to panel JSX**

In `PostAnimator.tsx`, replace the existing reply_to block (currently around lines 161–168):

```tsx
{post.reply_to && (
    <div className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm">
        <p className="mb-1 font-semibold text-white/50">
            ↩ {post.reply_to.author_handle}
        </p>
        <p className="line-clamp-2">{post.reply_to.body}</p>
    </div>
)}
```

with:

```tsx
{post.reply_to && (
    <a
        href={post.reply_to.original_url}
        target="_blank"
        rel="noopener noreferrer"
        className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm hover:bg-white/20"
    >
        <div className="mb-2 flex items-center gap-1.5">
            <span className="text-white/40">↩</span>
            <AuthorChip
                name={post.reply_to.author_name}
                avatar={post.reply_to.author_avatar}
                emojis={post.emojis}
                subtext={post.reply_to.author_handle}
            />
        </div>
        <p className="line-clamp-3">{post.reply_to.body}</p>
    </a>
)}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Visually verify the reply-to panel**

With the dev server running, find a reply post in the feed. Confirm:
- The panel is clickable (opens original post in new tab)
- Avatar, display name, and handle are visible
- Body text shows up to 3 lines
- Hover state darkens the panel slightly
- The Attribution bar at the bottom still matches the visual style

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx
git commit -m "✨ Enrich reply-to panel with author identity and link to original post"
```
