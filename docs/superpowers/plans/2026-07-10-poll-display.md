# Poll Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Mastodon poll results (options, vote counts/percentages, total votes, open/closed status, own vote) on posts that carry a poll, with a "Vote" link that opens the original post.

**Architecture:** Add an optional `poll` field to the normalized `Post` shape (backend `PostNormalizer::fromMastodon`, frontend `Post` type). Render it via a new standalone `PollResults` component, wired into all three render branches of `PostAnimator.tsx` (image posts, no-body/panel-only posts, body-text posts). Bluesky posts never populate `poll` — no Bluesky-side changes.

**Tech Stack:** Laravel/PHP (Pest tests), React/TypeScript (Vitest + Testing Library), Tailwind, lucide-react icons.

Spec: `docs/superpowers/specs/2026-07-10-poll-display-design.md`

---

### Task 1: Backend — normalize Mastodon poll data

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Test: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('normalises a mastodon poll', function () {
    $status = [
        'id' => '555',
        'content' => '<p>Best editor?</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/555',
        'account' => [
            'display_name' => 'Test User',
            'acct' => 'user',
            'avatar' => 'https://mastodon.example/avatars/original/user.jpg',
        ],
        'poll' => [
            'id' => '12345',
            'expires_at' => '2024-01-16T10:00:00.000Z',
            'expired' => false,
            'multiple' => false,
            'votes_count' => 30,
            'options' => [
                ['title' => 'Vim', 'votes_count' => 20],
                ['title' => 'Emacs', 'votes_count' => 10],
            ],
            'voted' => false,
            'own_votes' => [],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['poll'])->toBe([
        'id' => '12345',
        'expires_at' => '2024-01-16T10:00:00.000Z',
        'expired' => false,
        'multiple' => false,
        'votes_count' => 30,
        'options' => [
            ['title' => 'Vim', 'votes_count' => 20],
            ['title' => 'Emacs', 'votes_count' => 10],
        ],
        'voted' => false,
        'own_votes' => [],
    ]);
});

it('sets poll to null when a mastodon status has no poll', function () {
    $status = [
        'id' => '556',
        'content' => '<p>No poll here</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/556',
        'account' => [
            'display_name' => 'Test User',
            'acct' => 'user',
            'avatar' => 'https://mastodon.example/avatars/original/user.jpg',
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['poll'])->toBeNull();
});

it('normalises an expired multiple-choice mastodon poll with own votes', function () {
    $status = [
        'id' => '557',
        'content' => '<p>Pick your toppings</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/557',
        'account' => [
            'display_name' => 'Test User',
            'acct' => 'user',
            'avatar' => 'https://mastodon.example/avatars/original/user.jpg',
        ],
        'poll' => [
            'id' => '999',
            'expires_at' => '2024-01-14T10:00:00.000Z',
            'expired' => true,
            'multiple' => true,
            'votes_count' => 5,
            'options' => [
                ['title' => 'Cheese', 'votes_count' => 3],
                ['title' => 'Pepperoni', 'votes_count' => 2],
            ],
            'voted' => true,
            'own_votes' => [0, 1],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['poll']['expired'])->toBeTrue()
        ->and($post['poll']['multiple'])->toBeTrue()
        ->and($post['poll']['voted'])->toBeTrue()
        ->and($post['poll']['own_votes'])->toBe([0, 1]);
});

it('sets poll to null for a bluesky post', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'hello bluesky',
                'createdAt' => '2024-01-15T10:00:00.000Z',
            ],
            'author' => [
                'did' => 'did:plc:abc',
                'handle' => 'user.bsky.social',
                'displayName' => 'Test User',
                'avatar' => 'https://example.com/avatar.jpg',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post)->not->toHaveKey('poll');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter="poll"`
Expected: FAIL — `$post['poll']` is undefined (the `fromMastodon` array has no `poll` key yet).

- [ ] **Step 3: Implement `normalizePoll` and wire it into `fromMastodon`**

In `app/Services/Feed/PostNormalizer.php`, add this private method after `mastodonQuotedPost` (after line 230, before `blueskyReplyTo` at line 232):

```php
    private function normalizeMastodonPoll(array $source): ?array
    {
        $poll = $source['poll'] ?? null;

        if ($poll === null) {
            return null;
        }

        return [
            'id' => $poll['id'],
            'expires_at' => $poll['expires_at'],
            'expired' => (bool) $poll['expired'],
            'multiple' => (bool) $poll['multiple'],
            'votes_count' => $poll['votes_count'],
            'options' => array_map(
                fn (array $opt) => [
                    'title' => $opt['title'],
                    'votes_count' => $opt['votes_count'],
                ],
                $poll['options'],
            ),
            'voted' => (bool) ($poll['voted'] ?? false),
            'own_votes' => $poll['own_votes'] ?? [],
        ];
    }
```

Then in `fromMastodon()` (the returned array, after the `'quoted_post'` line at line 57), add:

```php
            'poll' => $this->normalizeMastodonPoll($source),
```

So the array around lines 56-58 reads:

```php
            'reply_to' => $this->mastodonReplyTo($parentStatus, $host, $mentionsEnabled),
            'quoted_post' => $this->mastodonQuotedPost($source, $host, $quoteStatus, $mentionsEnabled),
            'poll' => $this->normalizeMastodonPoll($source),
            'boosted_by' => $booster,
```

Do **not** modify `fromBluesky()` — its returned array simply has no `poll` key, which is what the last test asserts.

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact --filter="poll"`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full PostNormalizer test suite to check for regressions**

Run: `php artisan test --compact tests/Unit/Feed/PostNormalizerTest.php`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 6: Run Pint and commit**

```bash
vendor/bin/pint --dirty --format agent
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Normalize Mastodon poll data in PostNormalizer (#193)"
```

---

### Task 2: Frontend — add `Poll`/`PollOption` types

**Files:**
- Modify: `resources/js/types/post.ts`

- [ ] **Step 1: Add the types and the `poll` field**

In `resources/js/types/post.ts`, add after the `QuotedPost` interface (after line 33, before `export interface Post`):

```ts
export interface PollOption {
    title: string;
    votes_count: number | null;
}

export interface Poll {
    id: string;
    expires_at: string | null;
    expired: boolean;
    multiple: boolean;
    votes_count: number;
    options: PollOption[];
    voted: boolean;
    own_votes: number[];
}
```

Then add `poll?: Poll;` to the `Post` interface, immediately after the `sensitive_media: boolean;` line (line 66):

```ts
    sensitive_media: boolean;
    poll?: Poll;
}
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors (there are no consumers of `Post.poll` yet, so this should be clean)

- [ ] **Step 3: Commit**

```bash
git add resources/js/types/post.ts
git commit -m "🎇 Add Poll type to Post shape (#193)"
```

---

### Task 3: Frontend — export `timeSince` from Attribution.tsx for reuse

**Files:**
- Modify: `resources/js/components/feed/Attribution.tsx:6`

- [ ] **Step 1: Export the existing `timeSince` helper**

In `resources/js/components/feed/Attribution.tsx`, change line 6 from:

```ts
function timeSince(dateStr: string): string {
```

to:

```ts
export function timeSince(dateStr: string): string {
```

No other change — the function body and all existing call sites in this file are unaffected.

- [ ] **Step 2: Verify existing Attribution tests still pass**

Run: `npx vitest run resources/js/components/feed/Attribution.test.tsx`
Expected: PASS (if this test file doesn't exist yet, run `npx vitest run resources/js/components/feed` instead and confirm no regressions)

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/feed/Attribution.tsx
git commit -m "🔄️ Export timeSince helper from Attribution for reuse (#193)"
```

---

### Task 4: Frontend — `PollResults` component

**Files:**
- Create: `resources/js/components/feed/PollResults.tsx`
- Test: `resources/js/components/feed/PollResults.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `resources/js/components/feed/PollResults.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Poll } from '@/types/post';
import { PollResults } from './PollResults';

const basePoll: Poll = {
    id: '1',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    expired: false,
    multiple: false,
    votes_count: 30,
    options: [
        { title: 'Vim', votes_count: 20 },
        { title: 'Emacs', votes_count: 10 },
    ],
    voted: false,
    own_votes: [],
};

describe('PollResults', () => {
    it('renders each option with its vote count and percentage', () => {
        render(
            <PollResults poll={basePoll} originalUrl="https://example.com/post/1" />,
        );

        expect(screen.getByText('Vim')).toBeInTheDocument();
        expect(screen.getByText(/20 votes/)).toBeInTheDocument();
        expect(screen.getByText(/67%/)).toBeInTheDocument();
        expect(screen.getByText('Emacs')).toBeInTheDocument();
        expect(screen.getByText(/10 votes/)).toBeInTheDocument();
        expect(screen.getByText(/33%/)).toBeInTheDocument();
    });

    it('shows total vote count', () => {
        render(
            <PollResults poll={basePoll} originalUrl="https://example.com/post/1" />,
        );

        expect(screen.getByText(/30 votes total/)).toBeInTheDocument();
    });

    it('shows "Poll closed" for an expired poll', () => {
        const expired: Poll = { ...basePoll, expired: true };
        render(
            <PollResults poll={expired} originalUrl="https://example.com/post/1" />,
        );

        expect(screen.getByText('Poll closed')).toBeInTheDocument();
    });

    it('does not show "Poll closed" for an open poll', () => {
        render(
            <PollResults poll={basePoll} originalUrl="https://example.com/post/1" />,
        );

        expect(screen.queryByText('Poll closed')).not.toBeInTheDocument();
    });

    it('shows a multiple-choice label when the poll allows multiple selections', () => {
        const multi: Poll = { ...basePoll, multiple: true };
        render(
            <PollResults poll={multi} originalUrl="https://example.com/post/1" />,
        );

        expect(screen.getByText(/multiple choice/i)).toBeInTheDocument();
    });

    it('highlights the option(s) the connected account voted for', () => {
        const voted: Poll = { ...basePoll, voted: true, own_votes: [0] };
        render(
            <PollResults poll={voted} originalUrl="https://example.com/post/1" />,
        );

        expect(screen.getByTestId('poll-option-0')).toHaveAttribute(
            'data-voted',
            'true',
        );
        expect(screen.getByTestId('poll-option-1')).toHaveAttribute(
            'data-voted',
            'false',
        );
    });

    it('renders a vote link pointing at the original post', () => {
        render(
            <PollResults poll={basePoll} originalUrl="https://example.com/post/1" />,
        );

        const link = screen.getByRole('link', { name: /vote/i });
        expect(link).toHaveAttribute('href', 'https://example.com/post/1');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run resources/js/components/feed/PollResults.test.tsx`
Expected: FAIL — `Cannot find module './PollResults'`

- [ ] **Step 3: Implement `PollResults.tsx`**

Create `resources/js/components/feed/PollResults.tsx`:

```tsx
import { Check } from 'lucide-react';
import type { Poll } from '@/types/post';
import { timeSince } from './Attribution';

const PANEL_CLASS =
    'max-w-[40ch] rounded border border-white/20 bg-black/40 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm';

function pollStatus(poll: Poll): string {
    if (poll.expired) {
        return 'Poll closed';
    }

    if (!poll.expires_at) {
        return 'Poll open';
    }

    return `Closes ${timeSince(poll.expires_at)}`;
}

export function PollResults({
    poll,
    originalUrl,
}: {
    poll: Poll;
    originalUrl: string;
}) {
    const total = poll.votes_count;

    return (
        <div className={PANEL_CLASS}>
            <div className="mb-2 flex items-center justify-between gap-2 text-white/50 text-xs">
                <span>{pollStatus(poll)}</span>
                {poll.multiple && <span>Multiple choice</span>}
            </div>
            <div className="flex flex-col gap-2">
                {poll.options.map((option, index) => {
                    const votes = option.votes_count ?? 0;
                    const pct = total > 0 ? Math.round((votes / total) * 100) : 0;
                    const isOwnVote = poll.voted && poll.own_votes.includes(index);

                    return (
                        <div
                            key={option.title}
                            data-testid={`poll-option-${index}`}
                            data-voted={isOwnVote}
                            className={`relative overflow-hidden rounded border px-2 py-1.5 ${
                                isOwnVote
                                    ? 'border-white/60'
                                    : 'border-white/20'
                            }`}
                        >
                            <div
                                className="absolute inset-y-0 left-0 bg-white/15"
                                style={{ width: `${pct}%` }}
                            />
                            <div className="relative flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                    {isOwnVote && (
                                        <Check className="size-3.5 shrink-0" />
                                    )}
                                    {option.title}
                                </span>
                                <span className="shrink-0 text-white/50">
                                    {votes} votes ({pct}%)
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-white/50 text-xs">
                    {total} votes total
                </span>
                <a
                    href={originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/80 text-xs underline hover:text-white"
                >
                    Vote →
                </a>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run resources/js/components/feed/PollResults.test.tsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/feed/PollResults.tsx resources/js/components/feed/PollResults.test.tsx
git commit -m "🎇 Add PollResults component (#193)"
```

---

### Task 5: Wire `PollResults` into `PostAnimator.tsx`

**Files:**
- Modify: `resources/js/components/feed/PostAnimator.tsx`

`PostAnimator` has three separate render paths, and a poll-only post (no body, no media) currently falls through to `return null` — that path needs a poll check added too.

- [ ] **Step 1: Import `PollResults`**

At the top of `resources/js/components/feed/PostAnimator.tsx`, add the import after the `ImageCarousel` import (line 14):

```tsx
import { ImageCarousel } from './ImageCarousel';
import { MentionChips } from './MentionChips';
import { PollResults } from './PollResults';
```

(`MentionChips` import moves down one line; `PollResults` is inserted alphabetically between them.)

- [ ] **Step 2: Include `post.poll` in the "nothing to show" early-`onReady` check**

Change the `useLayoutEffect` at lines 226-234 from:

```tsx
    useLayoutEffect(() => {
        if (
            !body &&
            !(post.reply_to || post.quoted_post) &&
            post.media.length === 0
        ) {
            onReadyRef.current?.();
        }
    }, [body, post.reply_to, post.quoted_post, post.media.length]);
```

to:

```tsx
    useLayoutEffect(() => {
        if (
            !body &&
            !(post.reply_to || post.quoted_post || post.poll) &&
            post.media.length === 0
        ) {
            onReadyRef.current?.();
        }
    }, [body, post.reply_to, post.quoted_post, post.poll, post.media.length]);
```

- [ ] **Step 3: Render the poll in the image-post branch**

In the `post.media.length > 0` branch, the card currently renders body text, then (conditionally) a panel block with reply/quote/link. Change:

```tsx
                    {post.body && (
                        <div className="shrink-0 border-white/10 border-t px-4 py-3 text-sm text-white/80 leading-snug">
                            <EmojiText text={post.body} emojis={post.emojis} />
                        </div>
                    )}
                    {(post.reply_to || post.quoted_post || post.link_url) && (
```

to:

```tsx
                    {post.body && (
                        <div className="shrink-0 border-white/10 border-t px-4 py-3 text-sm text-white/80 leading-snug">
                            <EmojiText text={post.body} emojis={post.emojis} />
                        </div>
                    )}
                    {post.poll && (
                        <div className="shrink-0 border-white/10 border-t px-4 py-3">
                            <PollResults
                                poll={post.poll}
                                originalUrl={post.original_url}
                            />
                        </div>
                    )}
                    {(post.reply_to || post.quoted_post || post.link_url) && (
```

- [ ] **Step 4: Render the poll in the no-body branch (and fix the poll-only fall-through)**

The `if (!body)` branch currently only renders reply/quote/link panels and falls through to `return null` if none exist. Change the condition (originally at line 491):

```tsx
        if (post.link_url || post.quoted_post || post.reply_to) {
            return (
                <div className="flex h-full w-full items-center justify-center p-8">
                    <div
                        ref={panelsRef}
                        className="flex flex-col items-center gap-4"
                    >
```

to:

```tsx
        if (post.link_url || post.quoted_post || post.reply_to || post.poll) {
            return (
                <div className="flex h-full w-full items-center justify-center p-8">
                    <div
                        ref={panelsRef}
                        className="flex flex-col items-center gap-4"
                    >
```

and add the poll block inside that same `panelsRef` div, right before the `{post.link_url && <LinkCard ... />}` block (originally lines 522-528):

```tsx
                        {post.poll && (
                            <PollResults
                                poll={post.poll}
                                originalUrl={post.original_url}
                            />
                        )}
                        {post.link_url && (
                            <LinkCard
                                url={post.link_url}
                                title={post.link_title}
                                favicon={post.link_favicon}
                            />
                        )}
```

- [ ] **Step 5: Render the poll in the body-text branch**

In the final return block (the animated text case), add the poll right after the text `div` and before the existing `{post.link_url && <LinkCard .../>}` block (originally starting at line 605):

```tsx
                </div>
                {post.poll && (
                    <PollResults
                        poll={post.poll}
                        originalUrl={post.original_url}
                    />
                )}
                {post.link_url && (
                    <LinkCard
                        url={post.link_url}
                        title={post.link_title}
                        favicon={post.link_favicon}
                    />
                )}
```

- [ ] **Step 6: Write a rendering test covering all three branches**

Create `resources/js/components/feed/PostAnimator.poll.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

const basePost: Post = {
    id: 'p1',
    source: 'mastodon',
    source_handle: null,
    source_instance: 'mastodon.example',
    author_name: 'Test User',
    author_handle: '@user@mastodon.example',
    author_avatar: '',
    author_banner: null,
    body: '',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://mastodon.example/@user/1',
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
};

const poll = {
    id: '1',
    expires_at: null,
    expired: false,
    multiple: false,
    votes_count: 10,
    options: [
        { title: 'Yes', votes_count: 7 },
        { title: 'No', votes_count: 3 },
    ],
    voted: false,
    own_votes: [],
};

describe('PostAnimator — poll rendering', () => {
    it('renders poll results for a poll-only post (no body, no media)', () => {
        render(
            <PostAnimator post={{ ...basePost, poll }} colors={null} />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('renders poll results alongside body text', () => {
        render(
            <PostAnimator
                post={{ ...basePost, body: 'What do you think?', poll }}
                colors={null}
            />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders poll results on an image post', () => {
        render(
            <PostAnimator
                post={{
                    ...basePost,
                    media: [
                        {
                            type: 'image',
                            url: 'https://example.com/a.jpg',
                            preview_url: null,
                            alt_text: 'a photo',
                        },
                    ],
                    poll,
                }}
                colors={null}
                onRevealMedia={vi.fn()}
            />,
        );

        expect(screen.getByText('Yes')).toBeInTheDocument();
    });

    it('renders nothing but does not crash for a post with no body, no media, and no poll', () => {
        const { container } = render(
            <PostAnimator post={basePost} colors={null} />,
        );

        expect(container.firstChild).toBeNull();
    });
});
```

- [ ] **Step 7: Run the new test to verify it passes**

Run: `npx vitest run resources/js/components/feed/PostAnimator.poll.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 8: Run the full frontend test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS (all existing tests plus the new ones)

- [ ] **Step 9: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx resources/js/components/feed/PostAnimator.poll.test.tsx
git commit -m "🎇 Render poll results in PostAnimator (#193)"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run the full backend test suite**

Run: `php artisan test --compact`
Expected: PASS

- [ ] **Step 2: Run the full frontend test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Run Pint and ESLint/Biome checks**

```bash
vendor/bin/pint --format agent
npx eslint resources/js/components/feed/PollResults.tsx resources/js/components/feed/PostAnimator.tsx resources/js/components/feed/Attribution.tsx
```

Expected: no errors (fix any and re-commit if needed)

- [ ] **Step 4: Manually verify in the browser**

Start the dev server (`composer run dev` or ask the user if already running), open the app, and confirm:
- A Mastodon post with an open poll shows option bars, percentages, and total votes
- A Mastodon post with an expired poll shows "Poll closed"
- The "Vote →" link opens `original_url` in a new tab
- A poll on a post the connected account already voted on highlights the chosen option(s)
- Bluesky posts are unaffected (no poll ever renders)

This is a manual check — testing tools cannot verify visual rendering, so explicitly confirm this step was done (or was skipped and why) when reporting completion.
