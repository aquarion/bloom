# Mention Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify `@mentions` in Mastodon/Bluesky posts as `inline` (stays in body text) or `chip` (stripped to an author chip at the bottom of the post), gated behind the `beta_tester` role.

**Architecture:** A platform-agnostic `MentionClassifier` (pure logic, byte-offset based) is fed per-platform-detected mentions from `PostNormalizer`. Avatar/display-name resolution for `chip`-classified mentions happens as a batched enrichment pass per account (mirroring the existing Bluesky banner-enrichment pattern) before normalization. Frontend gets a new `chip_mentions: Mention[]` field on `Post`/`ReplyTo`/`QuotedPost`, rendered by a new `MentionChips` component.

**Tech Stack:** PHP/Laravel (Pest tests), TypeScript/React (Vitest).

---

### Task 1: `MentionClassifier` — pure classification logic

**Files:**
- Create: `app/Services/Feed/MentionClassifier.php`
- Test: `tests/Unit/Feed/MentionClassifierTest.php`

Operates entirely on **byte offsets** (matches Bluesky's `facet.byteStart`/`byteEnd` convention directly; Mastodon detection in Task 2 must produce byte offsets too — use plain `preg_match`/`preg_match_all` without the `u` modifier when capturing offsets, even though the matched text itself is valid UTF-8). Uses `substr`/`strlen` (byte-based), never `mb_substr`/`mb_strlen`, internally.

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Services\Feed\MentionClassifier;

it('returns empty array for no mentions', function () {
    $result = (new MentionClassifier)->classify('hello world', [], null);
    expect($result)->toBe([]);
});

it('classifies a single mid-text mention as inline', function () {
    $text = 'thanks @alice for the help';
    $mentions = [['id' => 'alice', 'start' => 7, 'end' => 13]];
    $result = (new MentionClassifier)->classify($text, $mentions, null);
    expect($result[0]['role'])->toBe('inline');
});

it('classifies a single leading mention as inline by default', function () {
    $text = '@alice thanks for the help';
    $mentions = [['id' => 'alice', 'start' => 0, 'end' => 6]];
    $result = (new MentionClassifier)->classify($text, $mentions, null);
    expect($result[0]['role'])->toBe('inline');
});

it('classifies a single leading mention as chip when it matches the origin', function () {
    $text = '@alice thanks for the help';
    $mentions = [['id' => 'alice', 'start' => 0, 'end' => 6]];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('chip');
});

it('classifies a trailing run of any size as chip, regardless of origin', function () {
    $text = 'check this out @bob @carol';
    $mentions = [
        ['id' => 'bob', 'start' => 15, 'end' => 19],
        ['id' => 'carol', 'start' => 20, 'end' => 26],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'bob');
    expect($result[0]['role'])->toBe('chip')
        ->and($result[1]['role'])->toBe('chip');
});

it('in a multi-mention leading run, keeps the origin match inline and chips the rest', function () {
    $text = '@alice @bob thanks for the help';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 7, 'end' => 11],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('inline')
        ->and($result[1]['role'])->toBe('chip');
});

it('in a multi-mention leading run with no origin match, chips all of them', function () {
    $text = '@alice @bob thanks for the help';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 7, 'end' => 11],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'carol');
    expect($result[0]['role'])->toBe('chip')
        ->and($result[1]['role'])->toBe('chip');
});

it('keeps mid-text mentions inline even when they match the origin', function () {
    $text = 'thanks @alice for the help';
    $mentions = [['id' => 'alice', 'start' => 7, 'end' => 13]];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('inline');
});

it('trailing rule takes precedence when the only mentions are both leading and trailing', function () {
    $text = '@alice @bob';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 7, 'end' => 11],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'alice');
    expect($result[0]['role'])->toBe('chip')
        ->and($result[1]['role'])->toBe('chip');
});

it('treats a leading run as broken by intervening non-whitespace text', function () {
    $text = '@alice hi @bob thanks';
    $mentions = [
        ['id' => 'alice', 'start' => 0, 'end' => 6],
        ['id' => 'bob', 'start' => 10, 'end' => 14],
    ];
    $result = (new MentionClassifier)->classify($text, $mentions, 'bob');
    // Only @alice is in the leading run (size 1, no origin match) -> inline.
    // @bob is mid-text (not leading, not trailing) -> inline by default.
    expect($result[0]['role'])->toBe('inline')
        ->and($result[1]['role'])->toBe('inline');
});

it('preserves input order and start/end offsets in the output', function () {
    $text = 'thanks @alice for the help';
    $mentions = [['id' => 'alice', 'start' => 7, 'end' => 13]];
    $result = (new MentionClassifier)->classify($text, $mentions, null);
    expect($result[0]['id'])->toBe('alice')
        ->and($result[0]['start'])->toBe(7)
        ->and($result[0]['end'])->toBe(13);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./vendor/bin/pest tests/Unit/Feed/MentionClassifierTest.php`
Expected: FAIL — class `App\Services\Feed\MentionClassifier` not found.

- [ ] **Step 3: Implement `MentionClassifier`**

```php
<?php

namespace App\Services\Feed;

class MentionClassifier
{
    public const ROLE_INLINE = 'inline';

    public const ROLE_CHIP = 'chip';

    /**
     * @param  string  $text  Plain text the mentions were found in.
     * @param  array<int, array{id: string, start: int, end: int}>  $mentions  Byte offsets within $text. 'id' is a platform-specific identity key (e.g. Mastodon acct, Bluesky did) used only for origin matching — exact, case-sensitive match. Order is not assumed.
     * @param  string|null  $originId  Identity key of the reply/quote origin author, in the same id-space as $mentions[]['id']. Null if there is no origin (not a reply/quote, or origin unknown).
     * @return array<int, array{id: string, start: int, end: int, role: string}> Same entries as input, sorted by start offset, with 'role' added.
     */
    public function classify(string $text, array $mentions, ?string $originId): array
    {
        if (empty($mentions)) {
            return [];
        }

        $sorted = $mentions;
        usort($sorted, fn (array $a, array $b) => $a['start'] <=> $b['start']);

        $leadingRun = $this->leadingRunLength($text, $sorted);
        $trailingRun = $this->trailingRunLength($text, $sorted);
        $count = count($sorted);

        return array_map(function (array $mention, int $index) use ($sorted, $leadingRun, $trailingRun, $count, $originId) {
            $inTrailing = $index >= $count - $trailingRun;
            $inLeading = $index < $leadingRun;
            $isOrigin = $originId !== null && $mention['id'] === $originId;

            $role = self::ROLE_INLINE;

            if ($inTrailing) {
                $role = self::ROLE_CHIP;
            } elseif ($inLeading) {
                if ($leadingRun === 1) {
                    $role = $isOrigin ? self::ROLE_CHIP : self::ROLE_INLINE;
                } else {
                    $role = $isOrigin ? self::ROLE_INLINE : self::ROLE_CHIP;
                }
            }

            $mention['role'] = $role;

            return $mention;
        }, $sorted, array_keys($sorted));
    }

    private function leadingRunLength(string $text, array $sortedMentions): int
    {
        $count = 0;
        $cursor = 0;

        foreach ($sortedMentions as $mention) {
            $gap = substr($text, $cursor, $mention['start'] - $cursor);
            if (trim($gap) !== '') {
                break;
            }
            $count++;
            $cursor = $mention['end'];
        }

        return $count;
    }

    private function trailingRunLength(string $text, array $sortedMentions): int
    {
        $count = 0;
        $cursor = strlen($text);

        foreach (array_reverse($sortedMentions) as $mention) {
            $gap = substr($text, $mention['end'], $cursor - $mention['end']);
            if (trim($gap) !== '') {
                break;
            }
            $count++;
            $cursor = $mention['start'];
        }

        return $count;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Feed/MentionClassifierTest.php`
Expected: PASS, all 11 tests.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Feed/MentionClassifier.php tests/Unit/Feed/MentionClassifierTest.php
git commit -m "🎇 Add MentionClassifier for inline/chip mention classification"
```

---

### Task 2: Mastodon mention detection in `PostNormalizer::fromMastodon`

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Test: `tests/Unit/Feed/PostNormalizerTest.php`

Mastodon statuses carry a `mentions` array (`[{id, username, url, acct}, ...]`) at the status level — use it for identity (more reliable than scraping HTML). Position is determined via regex over the plain-text body (post `strip_tags`, matching what `extractBody()` already produces before its `stripHashtags`/`stripUrls` calls).

- [ ] **Step 1: Write the failing test**

Add to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('classifies a single leading mastodon mention as inline by default', function () {
    $status = [
        'id' => '1',
        'content' => '<p>@alice thanks for the boost</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'mentions' => [
            ['id' => '2', 'username' => 'alice', 'url' => 'https://mastodon.example/@alice', 'acct' => 'alice'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toBe('@alice thanks for the boost')
        ->and($post['chip_mentions'])->toBe([]);
});

it('strips a trailing mastodon mention to a chip', function () {
    $status = [
        'id' => '1',
        'content' => '<p>check this out @alice</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'mentions' => [
            ['id' => '2', 'username' => 'alice', 'url' => 'https://mastodon.example/@alice', 'acct' => 'alice'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['body'])->toBe('check this out')
        ->and($post['chip_mentions'])->toHaveCount(1)
        ->and($post['chip_mentions'][0]['handle'])->toBe('@alice')
        ->and($post['chip_mentions'][0]['display_name'])->toBe('@alice')
        ->and($post['chip_mentions'][0]['avatar'])->toBe('')
        ->and($post['chip_mentions'][0]['profile_url'])->toBe('https://mastodon.example/@alice');
});

it('strips a leading mastodon mention that matches the reply origin to a chip', function () {
    $parentStatus = [
        'account' => ['display_name' => 'Alice', 'acct' => 'alice', 'avatar' => ''],
        'url' => 'https://mastodon.example/@alice/0',
        'content' => '<p>original</p>',
        'created_at' => '2024-01-15T09:00:00.000Z',
    ];
    $status = [
        'id' => '1',
        'content' => '<p>@alice no thanks</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'in_reply_to_id' => '0',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'mentions' => [
            ['id' => '2', 'username' => 'alice', 'url' => 'https://mastodon.example/@alice', 'acct' => 'alice'],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', $parentStatus);

    expect($post['body'])->toBe('no thanks')
        ->and($post['chip_mentions'])->toHaveCount(1)
        ->and($post['chip_mentions'][0]['handle'])->toBe('@alice');
});

it('returns no chip_mentions when mentions are absent', function () {
    $status = [
        'id' => '1',
        'content' => '<p>hello world</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example');

    expect($post['chip_mentions'])->toBe([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php -k "mastodon mention"`
Expected: FAIL — `chip_mentions` key doesn't exist in returned array; body still contains `@alice` in the trailing/reply-origin cases.

- [ ] **Step 3: Implement Mastodon mention detection and stripping**

In `app/Services/Feed/PostNormalizer.php`, add `use App\Services\Feed\MentionClassifier;` is unnecessary (same namespace) — add a property and two helper methods, then wire into `fromMastodon` and `extractBody`.

Add near the top of the class:

```php
class PostNormalizer
{
    private MentionClassifier $mentionClassifier;

    public function __construct()
    {
        $this->mentionClassifier = new MentionClassifier;
    }
```

Add a new private method (place it near `extractBody`):

```php
    /**
     * @param  array<int, array{id: string, username: string, url: string, acct: string}>  $apiMentions  The status's top-level 'mentions' array.
     * @return array{body: string, chip_mentions: array<int, array{handle: string, display_name: string, avatar: string, profile_url: string}>}
     */
    private function classifyMastodonMentions(string $plainText, array $apiMentions, ?string $originAcct): array
    {
        if (empty($apiMentions)) {
            return ['body' => $plainText, 'chip_mentions' => []];
        }

        $byAcct = [];
        $detected = [];

        foreach ($apiMentions as $m) {
            $acct = $m['acct'] ?? '';
            if ($acct === '') {
                continue;
            }
            $pattern = '/@'.preg_quote($acct, '/').'\b/';
            if (preg_match($pattern, $plainText, $match, PREG_OFFSET_CAPTURE)) {
                $start = $match[0][1];
                $end = $start + strlen($match[0][0]);
                $detected[] = ['id' => $acct, 'start' => $start, 'end' => $end];
                $byAcct[$acct] = $m;
            }
        }

        if (empty($detected)) {
            return ['body' => $plainText, 'chip_mentions' => []];
        }

        $classified = $this->mentionClassifier->classify($plainText, $detected, $originAcct);

        $chipMentions = [];
        $body = $plainText;
        $removed = 0;

        foreach ($classified as $mention) {
            if ($mention['role'] !== MentionClassifier::ROLE_CHIP) {
                continue;
            }

            $apiMention = $byAcct[$mention['id']];
            $chipMentions[] = [
                'handle' => '@'.$apiMention['acct'],
                'display_name' => '@'.$apiMention['acct'],
                'avatar' => '',
                'profile_url' => $this->safeUrl($apiMention['url']),
            ];

            $start = $mention['start'] - $removed;
            $length = $mention['end'] - $mention['start'];
            $body = substr($body, 0, $start).substr($body, $start + $length);
            $removed += $length;
        }

        $body = trim(preg_replace('/[ \t]{2,}/', ' ', $body) ?? $body);

        return ['body' => $body, 'chip_mentions' => $chipMentions];
    }
```

Now wire it into `extractBody` — change its signature to also accept the API mentions and origin acct, and return both body and chip_mentions. Replace:

```php
    private function extractBody(string $html): string
    {
        $withBreaks = str_replace(['</p>', '<br>', '<br/>'], "\n", $html);
        $text = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\n{3,}/', "\n\n", $text);

        return $this->stripHashtags($this->stripUrls(trim($text)));
    }
```

with:

```php
    private function extractBody(string $html, array $apiMentions = [], ?string $originAcct = null): array
    {
        $withBreaks = str_replace(['</p>', '<br>', '<br/>'], "\n", $html);
        $text = html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/\n{3,}/', "\n\n", $text);
        $text = $this->stripHashtags($this->stripUrls(trim($text)));

        return $this->classifyMastodonMentions($text, $apiMentions, $originAcct);
    }
```

`extractBody` now returns an array, not a string. Update its three call sites in `fromMastodon`, `mastodonReplyTo`, and `mastodonQuotedPost`.

In `fromMastodon`, replace:

```php
            'body' => $this->truncateBody($this->extractBody($source['content']), config('feed.body_limit', 1024)),
```

with:

```php
            ...$this->buildMastodonBody($source['content'], $status['mentions'] ?? [], $parentStatus, $quoteStatus, $source),
```

Then add a helper that determines the origin acct and shapes the final `body`/`chip_mentions` keys, and update the return array's `body` line to spread it:

```php
    /**
     * @return array{body: string, chip_mentions: array}
     */
    private function buildMastodonBody(string $content, array $apiMentions, ?array $parentStatus, ?array $quoteStatus, array $source): array
    {
        $originAcct = $parentStatus['account']['acct'] ?? ($source['quote']['quoted_status']['account']['acct'] ?? $quoteStatus['account']['acct'] ?? null);
        $extracted = $this->extractBody($content, $apiMentions, $originAcct);

        return [
            'body' => $this->truncateBody($extracted['body'], config('feed.body_limit', 1024)),
            'chip_mentions' => $extracted['chip_mentions'],
        ];
    }
```

This `buildMastodonBody` call replaces the single `'body' => ...,` line in the returned array of `fromMastodon` — since PHP array spread (`...`) inside an array literal merges keys, placing `...$this->buildMastodonBody(...)` where `'body' => ...` used to be will correctly contribute both `body` and `chip_mentions` keys to the final returned post array. Remove the old standalone `'body' => ...` line entirely (it's now produced by the spread).

- [ ] **Step 4: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php`
Expected: PASS — including all pre-existing tests (the `extractBody` signature change must not break any test that checks plain `body` output; since `buildMastodonBody` plumbs the same final string through, output should be identical for posts with no mentions).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Detect and classify Mastodon mentions in post body"
```

---

### Task 3: Apply Mastodon mention classification to `mastodonReplyTo`/`mastodonQuotedPost`

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Test: `tests/Unit/Feed/PostNormalizerTest.php`

Per the spec, the same rules apply to embedded reply/quote bodies. These nested bodies have no further "origin" context available (no grandparent data fetched), so `originAcct` is always `null` for them — only the trailing-run and multi-mention-leading-run-without-origin-match rules can fire (both convert to chip); a single leading mention always stays inline for these nested bodies.

- [ ] **Step 1: Write the failing test**

Add to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('strips a trailing mention from a mastodon reply_to body to a chip', function () {
    $parentStatus = [
        'account' => ['display_name' => 'Alice', 'acct' => 'alice', 'avatar' => ''],
        'url' => 'https://mastodon.example/@alice/0',
        'content' => '<p>hello @bob</p>',
        'created_at' => '2024-01-15T09:00:00.000Z',
        'mentions' => [
            ['id' => '3', 'username' => 'bob', 'url' => 'https://mastodon.example/@bob', 'acct' => 'bob'],
        ],
    ];
    $status = [
        'id' => '1',
        'content' => '<p>reply</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://mastodon.example/@user/1',
        'in_reply_to_id' => '0',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'mentions' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'mastodon.example', $parentStatus);

    expect($post['reply_to']['body'])->toBe('hello')
        ->and($post['reply_to']['chip_mentions'])->toHaveCount(1)
        ->and($post['reply_to']['chip_mentions'][0]['handle'])->toBe('@bob');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php -k "reply_to body to a chip"`
Expected: FAIL — `reply_to['chip_mentions']` key doesn't exist; body still contains `@bob`.

- [ ] **Step 3: Implement**

In `mastodonReplyTo`, replace:

```php
            'body' => $this->truncateBody(
                $this->extractBody($parent['content'])
            ),
```

with:

```php
            ...(function () use ($parent) {
                $extracted = $this->extractBody($parent['content'], $parent['mentions'] ?? [], null);

                return [
                    'body' => $this->truncateBody($extracted['body']),
                    'chip_mentions' => $extracted['chip_mentions'],
                ];
            })(),
```

In `mastodonQuotedPost`, replace:

```php
            'body' => $this->truncateBody($this->extractBody($raw['content'] ?? '')),
```

with:

```php
            ...(function () use ($raw) {
                $extracted = $this->extractBody($raw['content'] ?? '', $raw['mentions'] ?? [], null);

                return [
                    'body' => $this->truncateBody($extracted['body']),
                    'chip_mentions' => $extracted['chip_mentions'],
                ];
            })(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Apply mention classification to mastodon reply_to/quoted_post bodies"
```

---

### Task 4: Bluesky mention detection in `PostNormalizer::fromBluesky`

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Test: `tests/Unit/Feed/PostNormalizerTest.php`

Bluesky records carry `facets` (`[{index: {byteStart, byteEnd}, features: [{$type, did}]}]`) — byte offsets map directly onto `MentionClassifier`'s expected input, no regex needed. Identity key is the mentioned account's `did`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('classifies a single leading bluesky mention as inline by default', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:user/app.bsky.feed.post/1',
            'author' => ['handle' => 'user.bsky.social', 'displayName' => 'User'],
            'record' => [
                'text' => '@alice.bsky.social thanks for the boost',
                'createdAt' => '2024-01-15T10:00:00.000Z',
                'facets' => [
                    [
                        'index' => ['byteStart' => 0, 'byteEnd' => 18],
                        'features' => [['$type' => 'app.bsky.richtext.facet#mention', 'did' => 'did:plc:alice']],
                    ],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('@alice.bsky.social thanks for the boost')
        ->and($post['chip_mentions'])->toBe([]);
});

it('strips a trailing bluesky mention to a chip', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:user/app.bsky.feed.post/1',
            'author' => ['handle' => 'user.bsky.social', 'displayName' => 'User'],
            'record' => [
                'text' => 'check this out @alice.bsky.social',
                'createdAt' => '2024-01-15T10:00:00.000Z',
                'facets' => [
                    [
                        'index' => ['byteStart' => 15, 'byteEnd' => 34],
                        'features' => [['$type' => 'app.bsky.richtext.facet#mention', 'did' => 'did:plc:alice']],
                    ],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['body'])->toBe('check this out')
        ->and($post['chip_mentions'])->toHaveCount(1)
        ->and($post['chip_mentions'][0]['handle'])->toBe('')
        ->and($post['chip_mentions'][0]['profile_url'])->toBe('did:plc:alice');
});

it('returns no chip_mentions when bluesky facets are absent', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:user/app.bsky.feed.post/1',
            'author' => ['handle' => 'user.bsky.social', 'displayName' => 'User'],
            'record' => ['text' => 'hello world', 'createdAt' => '2024-01-15T10:00:00.000Z'],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['chip_mentions'])->toBe([]);
});
```

Note: `chip_mentions[0]['handle']` is `''` and `profile_url` temporarily holds the raw `did` — Bluesky facets give no handle/avatar, only a `did`. Task 6 (avatar resolution) replaces these placeholder values with the real handle/display_name/avatar/profile_url after a batched `getProfiles` lookup. This is an intentional two-stage pipeline: classify now (cheap, no network), resolve identity later (batched, cached).

- [ ] **Step 2: Run tests to verify they fail**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php -k "bluesky mention"`
Expected: FAIL — `chip_mentions` key doesn't exist; trailing-mention body still contains the mention text.

- [ ] **Step 3: Implement Bluesky mention detection and stripping**

Add a new private method to `PostNormalizer` (near `classifyMastodonMentions`):

```php
    /**
     * @param  array<int, array{index: array{byteStart: int, byteEnd: int}, features: array<int, array{'$type': string, did?: string}>}>  $facets
     * @return array{body: string, chip_mentions: array<int, array{handle: string, display_name: string, avatar: string, profile_url: string}>}
     */
    private function classifyBlueskyMentions(string $text, array $facets, ?string $originDid): array
    {
        $detected = [];

        foreach ($facets as $facet) {
            $did = null;
            foreach ($facet['features'] ?? [] as $feature) {
                if (($feature['$type'] ?? '') === 'app.bsky.richtext.facet#mention' && ! empty($feature['did'])) {
                    $did = $feature['did'];
                    break;
                }
            }

            if ($did === null) {
                continue;
            }

            $detected[] = [
                'id' => $did,
                'start' => $facet['index']['byteStart'] ?? 0,
                'end' => $facet['index']['byteEnd'] ?? 0,
            ];
        }

        if (empty($detected)) {
            return ['body' => $text, 'chip_mentions' => []];
        }

        $classified = $this->mentionClassifier->classify($text, $detected, $originDid);

        $chipMentions = [];
        $body = $text;
        $removed = 0;

        foreach ($classified as $mention) {
            if ($mention['role'] !== MentionClassifier::ROLE_CHIP) {
                continue;
            }

            // Placeholder values — Task 6 resolves the real handle/display_name/avatar
            // via a batched getProfiles lookup keyed on this did (stashed in profile_url).
            $chipMentions[] = [
                'handle' => '',
                'display_name' => '',
                'avatar' => '',
                'profile_url' => $mention['id'],
            ];

            $start = $mention['start'] - $removed;
            $length = $mention['end'] - $mention['start'];
            $body = substr($body, 0, $start).substr($body, $start + $length);
            $removed += $length;
        }

        $body = trim(preg_replace('/[ \t]{2,}/', ' ', $body) ?? $body);

        return ['body' => $body, 'chip_mentions' => $chipMentions];
    }
```

In `fromBluesky`, the current body line is:

```php
            'body' => $this->truncateBody($this->stripHashtags($this->stripUrls($text)), config('feed.body_limit', 1024)),
```

Replace it with a call that runs mention classification on `$text` **before** `stripHashtags`/`stripUrls` (mention byte offsets are computed against the raw `record.text`, so hashtag/URL stripping — which can shift byte positions — must happen after). Add this just above the `return [...]` block in `fromBluesky` (after `$labelData` is computed):

```php
        $originDid = ($feedPost['reply']['parent']['author']['did'] ?? null)
            ?? ($this->blueskyQuotedAuthorDid($post['embed'] ?? null));
        $mentionResult = $this->classifyBlueskyMentions($text, $record['facets'] ?? [], $originDid);
        $body = $this->truncateBody($this->stripHashtags($this->stripUrls($mentionResult['body'])), config('feed.body_limit', 1024));
```

Then change the return array's `'body' => ...,` line to `'body' => $body,` and add `'chip_mentions' => $mentionResult['chip_mentions'],` as a new key in the same returned array (place it next to `'hashtags' => $hashtags,`).

Add the small helper used above (place near `blueskyQuotedPost`):

```php
    private function blueskyQuotedAuthorDid(?array $embed): ?string
    {
        if ($embed === null) {
            return null;
        }

        $type = $embed['$type'] ?? '';
        $record = $type === 'app.bsky.embed.record#view' ? ($embed['record'] ?? null)
            : ($type === 'app.bsky.embed.recordWithMedia#view' ? ($embed['record']['record'] ?? null) : null);

        return $record['author']['did'] ?? null;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Detect and classify Bluesky mentions via record facets"
```

---

### Task 5: Apply Bluesky mention classification to `blueskyReplyTo`/`blueskyQuotedPost`

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Test: `tests/Unit/Feed/PostNormalizerTest.php`

Same nested-body caveat as Task 3: no grandparent context, so `originDid` is always `null` here.

- [ ] **Step 1: Write the failing test**

Add to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('strips a trailing mention from a bluesky reply_to body to a chip', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:user/app.bsky.feed.post/1',
            'author' => ['handle' => 'user.bsky.social', 'displayName' => 'User'],
            'record' => ['text' => 'reply', 'createdAt' => '2024-01-15T11:00:00.000Z'],
        ],
        'reply' => [
            'parent' => [
                'uri' => 'at://did:plc:alice/app.bsky.feed.post/0',
                'author' => ['handle' => 'alice.bsky.social', 'displayName' => 'Alice', 'did' => 'did:plc:alice'],
                'record' => [
                    'text' => 'hello @bob.bsky.social',
                    'createdAt' => '2024-01-15T10:00:00.000Z',
                    'facets' => [
                        [
                            'index' => ['byteStart' => 6, 'byteEnd' => 23],
                            'features' => [['$type' => 'app.bsky.richtext.facet#mention', 'did' => 'did:plc:bob']],
                        ],
                    ],
                ],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['reply_to']['body'])->toBe('hello')
        ->and($post['reply_to']['chip_mentions'])->toHaveCount(1)
        ->and($post['reply_to']['chip_mentions'][0]['profile_url'])->toBe('did:plc:bob');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php -k "bluesky reply_to body to a chip"`
Expected: FAIL — `reply_to['chip_mentions']` key doesn't exist; body still contains the mention text.

- [ ] **Step 3: Implement**

In `blueskyReplyTo`, replace:

```php
            'body' => $this->truncateBody($parent['record']['text']),
```

with:

```php
            ...(function () use ($parent) {
                $result = $this->classifyBlueskyMentions($parent['record']['text'], $parent['record']['facets'] ?? [], null);

                return [
                    'body' => $this->truncateBody($result['body']),
                    'chip_mentions' => $result['chip_mentions'],
                ];
            })(),
```

In `blueskyQuotedPost`, replace:

```php
            'body' => $this->truncateBody($text),
```

with:

```php
            ...(function () use ($text) {
                $result = $this->classifyBlueskyMentions($text, [], null);

                return [
                    'body' => $this->truncateBody($result['body']),
                    'chip_mentions' => $result['chip_mentions'],
                ];
            })(),
```

(`blueskyQuotedPost`'s `$record['value']` doesn't reliably expose `facets` in the embed-view shape used here — passing an empty facets array means quoted-post bodies get no chip classification for now. This is a known, acceptable limitation: the quoted post's own facets aren't present in the `recordWithMedia#view`/`record#view` embed payload Bluesky returns, only the plain text is. Revisit if Bluesky's embed view ever includes facets.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Apply mention classification to bluesky reply_to body"
```

---

### Task 6: Bluesky avatar resolution

**Files:**
- Modify: `app/Services/Bluesky/BlueskyFeedService.php`
- Test: `tests/Unit/Bluesky/BlueskyFeedServiceTest.php` (create if it doesn't already exist — check first with `find tests -iname "*BlueskyFeedService*"`)

Extends the existing `enrichWithBanners` batched-`getProfiles` pattern to also resolve `chip_mentions` whose `profile_url` is still a placeholder `did:` string (set in Task 4/5), replacing it with `handle`/`display_name`/`avatar`/`profile_url`.

- [ ] **Step 1: Check for an existing test file**

Run: `find tests -iname "*BlueskyFeedService*"`

If a file exists, read it fully first to match its existing fixture/mocking conventions before writing new tests. If none exists, create `tests/Unit/Bluesky/BlueskyFeedServiceTest.php` following the Pest style used in `tests/Unit/Feed/PostNormalizerTest.php` (plain `it(...)` functions, `uses(TestCase::class)`), mocking `Http::fake()` for the `getProfiles` endpoint.

- [ ] **Step 2: Write the failing test**

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyAuthService;
use App\Services\Bluesky\BlueskyFeedService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

it('resolves chip_mentions placeholder profile_url dids into real handle/avatar/profile_url', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
    ]);

    Http::fake([
        '*app.bsky.actor.getProfiles*' => Http::response([
            'profiles' => [
                ['did' => 'did:plc:alice', 'handle' => 'alice.bsky.social', 'displayName' => 'Alice', 'avatar' => 'https://example.com/alice.jpg'],
            ],
        ]),
    ]);

    $posts = [
        [
            'id' => 'p1',
            'chip_mentions' => [
                ['handle' => '', 'display_name' => '', 'avatar' => '', 'profile_url' => 'did:plc:alice'],
            ],
        ],
    ];

    $service = app(BlueskyFeedService::class);
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved[0]['chip_mentions'][0]['handle'])->toBe('@alice.bsky.social')
        ->and($resolved[0]['chip_mentions'][0]['display_name'])->toBe('Alice')
        ->and($resolved[0]['chip_mentions'][0]['avatar'])->toBe('https://example.com/alice.jpg')
        ->and($resolved[0]['chip_mentions'][0]['profile_url'])->toBe('https://bsky.app/profile/alice.bsky.social');
});

it('leaves chip_mentions with no placeholder dids untouched', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
    ]);

    Http::fake();

    $posts = [['id' => 'p1', 'chip_mentions' => []]];

    $service = app(BlueskyFeedService::class);
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved)->toBe($posts);
    Http::assertNothingSent();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `./vendor/bin/pest tests/Unit/Bluesky/BlueskyFeedServiceTest.php`
Expected: FAIL — method `resolveMentionProfiles` does not exist.

- [ ] **Step 4: Implement `resolveMentionProfiles`**

Add to `app/Services/Bluesky/BlueskyFeedService.php` (a public method alongside `getHomeTimeline`, using the same batching/caching pattern as `enrichWithBanners`):

```php
    /**
     * @param  array<int, array<string, mixed>>  $normalisedPosts  Posts already shaped by PostNormalizer::fromBluesky, each with a 'chip_mentions' key.
     */
    public function resolveMentionProfiles(array $normalisedPosts, SocialAccount $account): array
    {
        $cache = Cache::tags(["user:{$account->user_id}"]);
        $sentinel = '__uncached__';

        $didsToCheck = [];
        foreach ($normalisedPosts as $post) {
            foreach ($post['chip_mentions'] ?? [] as $mention) {
                if (str_starts_with($mention['profile_url'] ?? '', 'did:')) {
                    $didsToCheck[$mention['profile_url']] = true;
                }
            }
        }

        if (empty($didsToCheck)) {
            return $normalisedPosts;
        }

        $profiles = [];
        $didsToFetch = [];

        foreach (array_keys($didsToCheck) as $did) {
            $cached = $cache->get("bluesky:profile:{$did}:mention", $sentinel);
            if ($cached !== $sentinel) {
                $profiles[$did] = $cached ?: null;
            } else {
                $didsToFetch[] = $did;
            }
        }

        foreach (array_chunk($didsToFetch, 25) as $batch) {
            try {
                $actorQuery = implode('&', array_map(fn ($d) => 'actors='.rawurlencode($d), $batch));

                $response = $this->request($account, fn (string $token) => Http::withToken($token)
                    ->get(self::BASE.'/app.bsky.actor.getProfiles?'.$actorQuery)
                    ->throw()
                    ->json()
                );

                $fetched = [];
                foreach ($response['profiles'] ?? [] as $profile) {
                    $did = $profile['did'];
                    $resolved = [
                        'handle' => $profile['handle'] ?? null,
                        'displayName' => $profile['displayName'] ?? null,
                        'avatar' => $profile['avatar'] ?? null,
                    ];
                    $profiles[$did] = $resolved;
                    $fetched[$did] = true;
                    $cache->put("bluesky:profile:{$did}:mention", $resolved, self::PROFILE_TTL);
                }

                foreach ($batch as $did) {
                    if (! isset($fetched[$did])) {
                        $profiles[$did] = null;
                        $cache->put("bluesky:profile:{$did}:mention", '', self::PROFILE_TTL);
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch Bluesky profiles for mention resolution', [
                    'error' => $e->getMessage(),
                ]);
                foreach ($batch as $did) {
                    $cache->put("bluesky:profile:{$did}:mention", '', 300);
                }
            }
        }

        return array_map(function (array $post) use ($profiles) {
            $post['chip_mentions'] = array_map(function (array $mention) use ($profiles) {
                $did = $mention['profile_url'] ?? '';
                $profile = $profiles[$did] ?? null;

                if (! is_array($profile) || empty($profile['handle'])) {
                    return $mention;
                }

                return [
                    'handle' => '@'.$profile['handle'],
                    'display_name' => $profile['displayName'] ?: $profile['handle'],
                    'avatar' => $profile['avatar'] ?? '',
                    'profile_url' => "https://bsky.app/profile/{$profile['handle']}",
                ];
            }, $post['chip_mentions'] ?? []);

            return $post;
        }, $normalisedPosts);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Bluesky/BlueskyFeedServiceTest.php`
Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Bluesky/BlueskyFeedService.php tests/Unit/Bluesky/BlueskyFeedServiceTest.php
git commit -m "🎇 Resolve Bluesky chip-mention avatars via batched getProfiles"
```

---

### Task 7: Mastodon avatar resolution

**Files:**
- Modify: `app/Services/Mastodon/MastodonFeedService.php`
- Test: `tests/Unit/Mastodon/MastodonFeedServiceTest.php` (check first with `find tests -iname "*MastodonFeedService*"`)

Resolves `chip_mentions` whose `avatar` is still `''` via a per-`acct` lookup against `GET {instance_url}/api/v1/accounts/lookup?acct={acct}`, cached 24h per acct (negative results cached too, to avoid repeat-fetching the same broken/remote account).

- [ ] **Step 1: Check for an existing test file**

Run: `find tests -iname "*MastodonFeedService*"`. Read it fully first if it exists; otherwise create `tests/Unit/Mastodon/MastodonFeedServiceTest.php` matching this codebase's Pest conventions.

- [ ] **Step 2: Write the failing test**

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

uses(TestCase::class);

it('resolves mastodon chip_mentions avatar/display_name via account lookup', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.example',
        'access_token' => 'token',
    ]);

    Http::fake([
        'mastodon.example/api/v1/accounts/lookup*' => Http::response([
            'display_name' => 'Alice',
            'avatar' => 'https://mastodon.example/avatars/alice.jpg',
        ]),
    ]);

    $posts = [
        [
            'id' => 'p1',
            'chip_mentions' => [
                ['handle' => '@alice', 'display_name' => '@alice', 'avatar' => '', 'profile_url' => 'https://mastodon.example/@alice'],
            ],
        ],
    ];

    $service = app(MastodonFeedService::class);
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved[0]['chip_mentions'][0]['display_name'])->toBe('Alice')
        ->and($resolved[0]['chip_mentions'][0]['avatar'])->toBe('https://mastodon.example/avatars/alice.jpg')
        ->and($resolved[0]['chip_mentions'][0]['handle'])->toBe('@alice');
});

it('falls back to the placeholder when the mastodon lookup fails', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.example',
        'access_token' => 'token',
    ]);

    Http::fake([
        'mastodon.example/api/v1/accounts/lookup*' => Http::response([], 404),
    ]);

    $posts = [
        [
            'id' => 'p1',
            'chip_mentions' => [
                ['handle' => '@ghost', 'display_name' => '@ghost', 'avatar' => '', 'profile_url' => 'https://mastodon.example/@ghost'],
            ],
        ],
    ];

    $service = app(MastodonFeedService::class);
    $resolved = $service->resolveMentionProfiles($posts, $account);

    expect($resolved[0]['chip_mentions'][0]['display_name'])->toBe('@ghost')
        ->and($resolved[0]['chip_mentions'][0]['avatar'])->toBe('');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `./vendor/bin/pest tests/Unit/Mastodon/MastodonFeedServiceTest.php`
Expected: FAIL — method `resolveMentionProfiles` does not exist.

- [ ] **Step 4: Implement `resolveMentionProfiles`**

Add to `app/Services/Mastodon/MastodonFeedService.php`:

```php
    // How long to cache a resolved (or failed) mention-account lookup.
    private const MENTION_PROFILE_TTL = 86400;

    public function resolveMentionProfiles(array $normalisedPosts, SocialAccount $account): array
    {
        $cache = $this->userCache($account);
        $sentinel = '__uncached__';

        $acctsToCheck = [];
        foreach ($normalisedPosts as $post) {
            foreach ($post['chip_mentions'] ?? [] as $mention) {
                if (($mention['avatar'] ?? '') === '' && ! empty($mention['handle'])) {
                    $acct = ltrim($mention['handle'], '@');
                    $acctsToCheck[$acct] = true;
                }
            }
        }

        if (empty($acctsToCheck)) {
            return $normalisedPosts;
        }

        $resolved = [];

        foreach (array_keys($acctsToCheck) as $acct) {
            $key = "mastodon:mention_profile:{$account->id}:{$acct}";
            $cached = $cache->get($key, $sentinel);

            if ($cached !== $sentinel) {
                $resolved[$acct] = $cached ?: null;

                continue;
            }

            try {
                $response = Http::timeout(10)->withToken($account->access_token)
                    ->get("{$account->instance_url}/api/v1/accounts/lookup", ['acct' => $acct])
                    ->throw()
                    ->json();

                $profile = [
                    'display_name' => $response['display_name'] ?? null,
                    'avatar' => $response['avatar'] ?? null,
                ];
                $resolved[$acct] = $profile;
                $cache->put($key, $profile, self::MENTION_PROFILE_TTL);
            } catch (\Throwable $e) {
                $resolved[$acct] = null;
                $cache->put($key, '', self::MENTION_PROFILE_TTL);
            }
        }

        return array_map(function (array $post) use ($resolved) {
            $post['chip_mentions'] = array_map(function (array $mention) use ($resolved) {
                $acct = ltrim($mention['handle'] ?? '', '@');
                $profile = $resolved[$acct] ?? null;

                if (! is_array($profile)) {
                    return $mention;
                }

                return [
                    ...$mention,
                    'display_name' => $profile['display_name'] ?: $mention['display_name'],
                    'avatar' => $profile['avatar'] ?? '',
                ];
            }, $post['chip_mentions'] ?? []);

            return $post;
        }, $normalisedPosts);
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Mastodon/MastodonFeedServiceTest.php`
Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Mastodon/MastodonFeedService.php tests/Unit/Mastodon/MastodonFeedServiceTest.php
git commit -m "🎇 Resolve Mastodon chip-mention avatars via per-acct lookup"
```

---

### Task 8: Wire resolution and beta gating into `FeedAggregator`

**Files:**
- Modify: `app/Services/Feed/FeedAggregator.php`
- Test: `tests/Unit/Feed/FeedAggregatorTest.php` (check first with `find tests -iname "*FeedAggregator*"`)

When the user lacks the `beta_tester` role, mention classification must be fully bypassed (today's exact behavior: mentions stay inline, `chip_mentions` stays `[]`) — done by never calling the per-account resolution methods and by short-circuiting classification inside `PostNormalizer` itself.

- [ ] **Step 1: Check for an existing test file and read it fully if present**

Run: `find tests -iname "*FeedAggregator*"`.

- [ ] **Step 2: Add a `$mentionsEnabled` parameter to `PostNormalizer::fromMastodon`/`fromBluesky`**

This step revisits Tasks 2-5's wiring to add a gate. In `app/Services/Feed/PostNormalizer.php`, change both public method signatures to accept a trailing `bool $mentionsEnabled = true` parameter:

```php
    public function fromMastodon(array $status, string $host, ?array $parentStatus = null, string $sourceHandle = '', ?array $quoteStatus = null, bool $mentionsEnabled = true): array
```

```php
    public function fromBluesky(array $feedPost, string $sourceHandle = '', bool $mentionsEnabled = true): array
```

In `buildMastodonBody`, accept and check the flag — short-circuit before calling `extractBody` with mentions data:

```php
    private function buildMastodonBody(string $content, array $apiMentions, ?array $parentStatus, ?array $quoteStatus, array $source, bool $mentionsEnabled): array
    {
        if (! $mentionsEnabled) {
            $extracted = $this->extractBody($content, [], null);

            return [
                'body' => $this->truncateBody($extracted['body'], config('feed.body_limit', 1024)),
                'chip_mentions' => [],
            ];
        }

        $originAcct = $parentStatus['account']['acct'] ?? ($source['quote']['quoted_status']['account']['acct'] ?? $quoteStatus['account']['acct'] ?? null);
        $extracted = $this->extractBody($content, $apiMentions, $originAcct);

        return [
            'body' => $this->truncateBody($extracted['body'], config('feed.body_limit', 1024)),
            'chip_mentions' => $extracted['chip_mentions'],
        ];
    }
```

Update its call site in `fromMastodon` to pass `$mentionsEnabled` through: `...$this->buildMastodonBody($source['content'], $status['mentions'] ?? [], $parentStatus, $quoteStatus, $source, $mentionsEnabled),`.

Now gate `mastodonReplyTo` and `mastodonQuotedPost` (from Task 3). Change their signatures to accept the flag, and pass an empty mentions array when disabled. In `mastodonReplyTo`:

```php
    private function mastodonReplyTo(?array $parent, string $fallbackHost, bool $mentionsEnabled): ?array
    {
        if ($parent === null) {
            return null;
        }

        $parentHost = parse_url($parent['url'] ?? '', PHP_URL_HOST) ?? $fallbackHost;

        return [
            'author_name' => $parent['account']['display_name'] ?: $parent['account']['acct'],
            'author_handle' => str_contains($parent['account']['acct'], '@')
                ? "@{$parent['account']['acct']}"
                : "@{$parent['account']['acct']}@{$parentHost}",
            'author_avatar' => $this->safeUrl($parent['account']['avatar'] ?? ''),
            'original_url' => $this->safeUrl($parent['url'] ?? ''),
            ...(function () use ($parent, $mentionsEnabled) {
                $extracted = $this->extractBody($parent['content'], $mentionsEnabled ? ($parent['mentions'] ?? []) : [], null);

                return [
                    'body' => $this->truncateBody($extracted['body']),
                    'chip_mentions' => $extracted['chip_mentions'],
                ];
            })(),
            'created_at' => $parent['created_at'] ?? null,
        ];
    }
```

In `mastodonQuotedPost`:

```php
    private function mastodonQuotedPost(array $source, string $host, ?array $quoteStatus, bool $mentionsEnabled): ?array
    {
        $inlineQuote = $source['quote'] ?? null;
        $raw = (is_array($inlineQuote) && array_key_exists('quoted_status', $inlineQuote))
            ? ($inlineQuote['quoted_status'] ?? $quoteStatus)
            : ($inlineQuote ?? $quoteStatus);

        if ($raw === null) {
            return null;
        }

        $acct = $raw['account']['acct'] ?? '';
        $quoteHost = parse_url($raw['url'] ?? '', PHP_URL_HOST) ?? $host;

        return [
            'author_name' => ($raw['account']['display_name'] ?? '') ?: $acct,
            'author_handle' => str_contains($acct, '@') ? "@{$acct}" : "@{$acct}@{$quoteHost}",
            'author_avatar' => $this->safeUrl($raw['account']['avatar'] ?? ''),
            'original_url' => $this->safeUrl($raw['url'] ?? ''),
            ...(function () use ($raw, $mentionsEnabled) {
                $extracted = $this->extractBody($raw['content'] ?? '', $mentionsEnabled ? ($raw['mentions'] ?? []) : [], null);

                return [
                    'body' => $this->truncateBody($extracted['body']),
                    'chip_mentions' => $extracted['chip_mentions'],
                ];
            })(),
            'created_at' => $raw['created_at'] ?? null,
        ];
    }
```

Update the two call sites inside `fromMastodon` (`$this->mastodonReplyTo($parentStatus, $host)` → `$this->mastodonReplyTo($parentStatus, $host, $mentionsEnabled)`, and `$this->mastodonQuotedPost($source, $host, $quoteStatus)` → `$this->mastodonQuotedPost($source, $host, $quoteStatus, $mentionsEnabled)`).

Do the same in `fromBluesky`: only call `classifyBlueskyMentions` with real facets when `$mentionsEnabled` is true; otherwise pass `[]` for facets (which makes `classifyBlueskyMentions` return `chip_mentions: []` and the original text untouched, per its existing `empty($detected)` early-return):

```php
        $mentionResult = $this->classifyBlueskyMentions($text, $mentionsEnabled ? ($record['facets'] ?? []) : [], $mentionsEnabled ? $originDid : null);
```

Now gate `blueskyReplyTo` and `blueskyQuotedPost` (from Task 5). In `blueskyReplyTo`:

```php
    private function blueskyReplyTo(?array $parent, bool $mentionsEnabled): ?array
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
            ...(function () use ($parent, $mentionsEnabled) {
                $facets = $mentionsEnabled ? ($parent['record']['facets'] ?? []) : [];
                $result = $this->classifyBlueskyMentions($parent['record']['text'], $facets, null);

                return [
                    'body' => $this->truncateBody($result['body']),
                    'chip_mentions' => $result['chip_mentions'],
                ];
            })(),
            'created_at' => $parent['record']['createdAt'] ?? null,
        ];
    }
```

In `blueskyQuotedPost`, add the `bool $mentionsEnabled` parameter to its signature and change its body-building tail to:

```php
            ...(function () use ($text, $mentionsEnabled) {
                $result = $this->classifyBlueskyMentions($text, [], null);

                return $mentionsEnabled
                    ? ['body' => $this->truncateBody($result['body']), 'chip_mentions' => $result['chip_mentions']]
                    : ['body' => $this->truncateBody($text), 'chip_mentions' => []];
            })(),
```

Update the two call sites inside `fromBluesky` (`$this->blueskyReplyTo($feedPost['reply']['parent'] ?? null)` → `$this->blueskyReplyTo($feedPost['reply']['parent'] ?? null, $mentionsEnabled)`, and `$this->blueskyQuotedPost($post['embed'] ?? null)` → `$this->blueskyQuotedPost($post['embed'] ?? null, $mentionsEnabled)`).

- [ ] **Step 3: Pass the flag through `FeedAggregator::fetch`**

In `app/Services/Feed/FeedAggregator.php`, add a `bool $mentionsEnabled` parameter to `fetch()`:

```php
    public function fetch(User $user, int $limit = 20, ?string $cursor = null, bool $mentionsEnabled = false): array
```

Update the two normalizer call sites inside the per-account loop to pass it through:

```php
                        return $this->normalizer->fromMastodon(
                            $s,
                            $host,
                            $parents[$source['in_reply_to_id'] ?? ''] ?? null,
                            $account->handle,
                            $quoteId ? ($quotes[$quoteId] ?? null) : null,
                            $mentionsEnabled,
                        );
```

```php
                    $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, $account->handle, $mentionsEnabled), $result['posts']);
```

Then, immediately after each provider's `$normalised` is built (still inside the per-account `foreach` loop, before `$posts = $posts->concat($normalised);`), call the matching resolver only when `$mentionsEnabled` is true:

```php
                if ($account->provider === 'mastodon' && $mentionsEnabled) {
                    $normalised = $this->mastodon->resolveMentionProfiles($normalised, $account);
                }
```

```php
                if ($account->provider === 'bluesky' && $mentionsEnabled) {
                    $normalised = $this->bluesky->resolveMentionProfiles($normalised, $account);
                }
```

(Place the Mastodon check right after the Mastodon `$normalised = array_map(...)` line, and the Bluesky check right after the Bluesky `$normalised = array_map(...)` line, both still before the shared `applyAgeCutoff`/`concat` lines that follow both branches.)

- [ ] **Step 4: Write a test confirming the gate works end-to-end**

Add to `tests/Unit/Feed/FeedAggregatorTest.php` (create it following this codebase's existing service-test conventions if it doesn't exist):

```php
it('does not classify or resolve mentions when mentionsEnabled is false', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.example',
        'access_token' => 'token',
    ]);

    Http::fake([
        'mastodon.example/api/v1/timelines/home*' => Http::response([
            [
                'id' => '1',
                'content' => '<p>check this out @alice</p>',
                'created_at' => now()->toIso8601String(),
                'url' => 'https://mastodon.example/@user/1',
                'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
                'media_attachments' => [],
                'mentions' => [
                    ['id' => '2', 'username' => 'alice', 'url' => 'https://mastodon.example/@alice', 'acct' => 'alice'],
                ],
            ],
        ]),
    ]);

    $aggregator = app(\App\Services\Feed\FeedAggregator::class);
    $result = $aggregator->fetch($user, mentionsEnabled: false);

    expect($result['posts'][0]['body'])->toBe('check this out @alice')
        ->and($result['posts'][0]['chip_mentions'])->toBe([]);
    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'accounts/lookup'));
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./vendor/bin/pest tests/Unit/Feed/FeedAggregatorTest.php tests/Unit/Feed/PostNormalizerTest.php tests/Unit/Mastodon/MastodonFeedServiceTest.php tests/Unit/Bluesky/BlueskyFeedServiceTest.php`
Expected: PASS, all tests across all four files (re-running the earlier files confirms the new trailing parameters didn't break default-argument behavior for existing call sites).

- [ ] **Step 6: Wire the role check in `FeedController`**

In `app/Http/Controllers/FeedController.php`, add the import and pass the computed flag:

```php
use App\Enums\Role;
```

Change:

```php
        $user = $request->user();
        $result = $this->aggregator->fetch($user);
```

to:

```php
        $user = $request->user();
        $result = $this->aggregator->fetch($user, mentionsEnabled: $user->hasRole(Role::BetaTester));
```

- [ ] **Step 7: Run the full backend test suite**

Run: `./vendor/bin/pest`
Expected: PASS, no regressions anywhere (the `bool $mentionsEnabled = true` default on `PostNormalizer`'s public methods keeps every pre-existing direct-call test — which never sets this argument — running with classification enabled and `originAcct`/facets correctly absent, i.e. identical to their current behavior, since none of those fixtures include a `mentions` array or `facets`).

- [ ] **Step 8: Commit**

```bash
git add app/Services/Feed/FeedAggregator.php app/Services/Feed/PostNormalizer.php app/Http/Controllers/FeedController.php tests/Unit/Feed/FeedAggregatorTest.php
git commit -m "🎇 Gate mention classification behind beta_tester role"
```

---

### Task 9: Frontend `Post` type updates

**Files:**
- Modify: `resources/js/types/post.ts`

- [ ] **Step 1: Add the `Mention` type and `chip_mentions` field**

In `resources/js/types/post.ts`, add a new exported interface above `Post`:

```ts
export interface Mention {
    handle: string;
    display_name: string;
    avatar: string;
    profile_url: string;
}
```

Add `chip_mentions: Mention[];` to `ReplyTo`, `QuotedPost`, and `Post`:

```ts
export interface ReplyTo {
    author_name: string;
    author_handle: string;
    author_avatar: string;
    original_url: string;
    body: string;
    created_at: string | null;
    chip_mentions: Mention[];
}

export interface QuotedPost {
    author_name: string;
    author_handle: string;
    author_avatar: string;
    original_url: string;
    body: string;
    created_at: string | null;
    chip_mentions: Mention[];
}
```

And in `Post`, add it next to `hashtags`:

```ts
    /** Normalised hashtags: lowercase, no leading '#', deduplicated. e.g. ["rust", "programming"] */
    hashtags: string[];
    /** Mentions classified as incidental — stripped from `body`, shown as chips. Empty if none, or if disabled for this viewer. */
    chip_mentions: Mention[];
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: pre-existing errors only (in files unrelated to this change); no new errors from `post.ts` itself. Other files that construct a `Post`/`ReplyTo`/`QuotedPost` object (e.g. test fixtures) will now show missing-property errors — fix those by adding `chip_mentions: []` to each fixture as they're encountered in Task 11's test, or right now if `tsc` reports them.

- [ ] **Step 3: Commit**

```bash
git add resources/js/types/post.ts
git commit -m "🎇 Add Mention type and chip_mentions field to Post/ReplyTo/QuotedPost"
```

---

### Task 10: `MentionChips` component

**Files:**
- Create: `resources/js/components/feed/MentionChips.tsx`
- Test: `resources/js/components/feed/MentionChips.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Mention } from '@/types/post';
import { MentionChips } from './MentionChips';

const makeMention = (handle: string): Mention => ({
    handle,
    display_name: handle.replace('@', ''),
    avatar: '',
    profile_url: `https://example.com/${handle}`,
});

it('renders a chip for each mention', () => {
    render(<MentionChips mentions={[makeMention('@alice'), makeMention('@bob')]} />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
});

it('renders nothing when there are no mentions', () => {
    const { container } = render(<MentionChips mentions={[]} />);
    expect(container).toBeEmptyDOMElement();
});

it('links each chip to its profile_url in a new tab', () => {
    render(<MentionChips mentions={[makeMention('@alice')]} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://example.com/@alice');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run resources/js/components/feed/MentionChips.test.tsx`
Expected: FAIL — cannot find module `./MentionChips`.

- [ ] **Step 3: Implement `MentionChips`**

```tsx
import type { Mention } from '@/types/post';
import { AuthorChip } from './AuthorChip';

export function MentionChips({ mentions }: { mentions: Mention[] }) {
    if (mentions.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {mentions.map((mention) => (
                <a
                    key={mention.profile_url}
                    href={mention.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-[12rem]"
                >
                    <AuthorChip
                        name={mention.display_name}
                        avatar={mention.avatar}
                        emojis={{}}
                        account={mention.handle}
                    />
                </a>
            ))}
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run resources/js/components/feed/MentionChips.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Lint and typecheck**

```bash
npx tsc --noEmit
npx eslint resources/js/components/feed/MentionChips.tsx
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add resources/js/components/feed/MentionChips.tsx resources/js/components/feed/MentionChips.test.tsx
git commit -m "🎇 Add MentionChips component"
```

---

### Task 11: Integrate `MentionChips` into `PostAnimator`

**Files:**
- Modify: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Import the component**

Add to the imports at the top of `resources/js/components/feed/PostAnimator.tsx`:

```tsx
import { MentionChips } from './MentionChips';
```

- [ ] **Step 2: Render chips for the main post body**

In the final return block, after the hashtags block (around line 512-530, ending `)}`) and before the closing `</div></div>` of the function, add:

```tsx
                {post.chip_mentions.length > 0 && (
                    <MentionChips mentions={post.chip_mentions} />
                )}
```

Place this as a sibling after the `{post.hashtags.length > 0 && (...)}` block, still inside the same outer `<div className="relative flex flex-col items-center gap-4">` — i.e. it does not go inside the `textRef` div, so it's never included in the GSAP line-splitting/measurement logic that operates on that ref's contents.

- [ ] **Step 3: Pass `chip_mentions` through to `ContextPanel`**

`ContextPanel` (defined at the top of this file, lines 23-69) needs a new optional prop. Update its signature:

```tsx
function ContextPanel({
    icon,
    author_name,
    author_avatar,
    author_handle,
    emojis,
    body,
    original_url,
    chip_mentions,
}: {
    icon: React.ReactNode;
    author_name: string;
    author_avatar: string;
    author_handle: string;
    emojis: Record<string, string>;
    body: string;
    original_url: string;
    chip_mentions: Mention[];
}) {
```

(Add `import type { Mention, Post } from '@/types/post';` — `Post` is presumably already imported; check the existing import line and extend it to include `Mention` rather than duplicating the import statement.)

Update its rendered content to include the chips after the body paragraph:

```tsx
    const content = (
        <>
            <div className="mb-2 flex items-center gap-1.5">
                <span className="text-white/40">{icon}</span>
                <AuthorChip
                    name={author_name}
                    avatar={author_avatar}
                    emojis={emojis}
                    account={author_handle}
                />
            </div>
            <p className="whitespace-pre-wrap">{body}</p>
            {chip_mentions.length > 0 && (
                <div className="mt-2">
                    <MentionChips mentions={chip_mentions} />
                </div>
            )}
        </>
    );
```

- [ ] **Step 4: Pass `chip_mentions` at all four `ContextPanel` call sites**

There are four `<ContextPanel>` usages in this file (two for `post.reply_to`, two for `post.quoted_post` — one pair in the link/quote/reply-only early-return branch around line 402-423, one pair in the main text-rendering branch around line 449-470). Add `chip_mentions={post.reply_to.chip_mentions}` to both `post.reply_to` call sites, and `chip_mentions={post.quoted_post.chip_mentions}` to both `post.quoted_post` call sites. Example for one of the four (repeat the equivalent edit at the other three):

```tsx
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
```

- [ ] **Step 5: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint resources/js/components/feed/PostAnimator.tsx
```

Expected: no new errors (any pre-existing errors in this file or others are unrelated to this change).

- [ ] **Step 6: Visually verify if feasible**

Run `npm run dev`, open the feed page. Since `chip_mentions` will always be `[]` until a beta-tester account actually encounters a trailing/origin-matching mention in a live post, this may not be directly observable without crafted test data — if so, skip and rely on the automated tests from Tasks 1-10 plus the typecheck/lint pass here.

- [ ] **Step 7: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx
git commit -m "🎇 Render MentionChips in PostAnimator for posts and context panels"
```
