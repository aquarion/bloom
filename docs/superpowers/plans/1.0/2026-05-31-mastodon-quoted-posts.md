# Mastodon Quoted Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect and normalise Mastodon quoted posts (inline `quote` field and `quote_id` fetch) so they render using the existing `QuotedPost` frontend component.

**Architecture:** Generalise `FeedAggregator::fetchMastodonParents` into a reusable `fetchMastodonStatuses` method driven by a callable ID extractor. Call it twice — once for reply parents, once for quote IDs. Pass the resolved quote status into a new `mastodonQuotedPost()` method on `PostNormalizer` that checks `$source['quote']` first, then the passed status, then returns null.

**Tech Stack:** PHP 8.2, Laravel, Pest (tests)

---

## Files

| File | Change |
|------|--------|
| `app/Services/Feed/FeedAggregator.php` | Rename `fetchMastodonParents` → `fetchMastodonStatuses`; add quote fetch; pass quote into normalizer |
| `app/Services/Feed/PostNormalizer.php` | Add `?array $quoteStatus = null` param; add `mastodonQuotedPost()` |
| `tests/Unit/Feed/PostNormalizerTest.php` | Add Mastodon quoted post test cases |

No new files. No frontend changes.

---

### Task 1: Generalise `fetchMastodonStatuses` in FeedAggregator

**Files:**
- Modify: `app/Services/Feed/FeedAggregator.php`

- [ ] **Step 1: Write a failing test for `fetchMastodonStatuses`**

Create `tests/Unit/Feed/FeedAggregatorTest.php`:

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Feed\FeedAggregator;
use App\Services\Feed\PostNormalizer;
use App\Services\Mastodon\MastodonFeedService;
use Tests\TestCase;

uses(TestCase::class);

it('fetches missing statuses using the id extractor', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $statuses = [
        ['id' => '1', 'in_reply_to_id' => '99', 'content' => '<p>hi</p>'],
        ['id' => '2', 'in_reply_to_id' => null, 'content' => '<p>bye</p>'],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getStatus')
        ->once()
        ->with($account, '99')
        ->andReturn(['id' => '99', 'content' => '<p>parent</p>']);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        Mockery::mock(PostNormalizer::class),
    );

    $result = $aggregator->fetchMastodonStatusesPublic(
        $account,
        $statuses,
        fn ($s) => $s['in_reply_to_id'] ?? null,
    );

    expect($result)->toHaveKey('99')
        ->and($result['99']['id'])->toBe('99');
});

it('uses batch status instead of fetching when already present', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $statuses = [
        ['id' => '1', 'in_reply_to_id' => '2', 'content' => '<p>reply</p>'],
        ['id' => '2', 'in_reply_to_id' => null, 'content' => '<p>original</p>'],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldNotReceive('getStatus');

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        Mockery::mock(PostNormalizer::class),
    );

    $result = $aggregator->fetchMastodonStatusesPublic(
        $account,
        $statuses,
        fn ($s) => $s['in_reply_to_id'] ?? null,
    );

    expect($result)->toHaveKey('2')
        ->and($result['2']['id'])->toBe('2');
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
./vendor/bin/pest tests/Unit/Feed/FeedAggregatorTest.php
```

Expected: FAIL — `fetchMastodonStatusesPublic` does not exist.

- [ ] **Step 3: Rename `fetchMastodonParents` and add test shim**

Replace `app/Services/Feed/FeedAggregator.php` private method and update the caller:

```php
public function fetch(User $user, int $limit = 20, ?string $cursor = null): array
{
    $user->loadMissing('socialAccounts');

    $cursors = $cursor ? json_decode(base64_decode($cursor), true) : [];
    $posts = collect();

    $perProviderLimit = config('feed.per_provider_limit', 20);

    foreach ($user->socialAccounts as $account) {
        $accountCursor = $cursors[$account->id] ?? null;

        try {
            if ($account->provider === 'mastodon') {
                $host = parse_url($account->instance_url, PHP_URL_HOST);
                $statuses = $this->mastodon->getHomeTimeline($account, $perProviderLimit, $accountCursor);

                $parents = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => $s['in_reply_to_id'] ?? null);
                $quotes  = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['quote_id'] ?? null);

                $normalised = array_map(function ($s) use ($host, $parents, $quotes, $account) {
                    $source = $s['reblog'] ?? $s;
                    $quoteId = $source['quote_id'] ?? null;
                    return $this->normalizer->fromMastodon(
                        $s,
                        $host,
                        $parents[$s['in_reply_to_id'] ?? ''] ?? null,
                        $account->handle,
                        $quoteId ? ($quotes[$quoteId] ?? null) : null,
                    );
                }, $statuses);

                $nextCursor = ! empty($statuses) ? end($statuses)['id'] : null;
                $posts = $posts->concat($normalised);
                if ($nextCursor) {
                    $cursors[$account->id] = $nextCursor;
                }
            }

            if ($account->provider === 'bluesky') {
                $result = $this->bluesky->getHomeTimeline($account, $perProviderLimit, $accountCursor);
                $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, $account->handle), $result['posts']);
                $posts = $posts->concat($normalised);
                if ($result['cursor']) {
                    $cursors[$account->id] = $result['cursor'];
                }
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to fetch feed for account', [
                'account_id' => $account->id,
                'provider' => $account->provider,
                'error' => $e->getMessage(),
            ]);
        }
    }

    $bufferSize = config('feed.buffer_size', 40);
    $sorted = $posts->sortByDesc('created_at')->values()->take($bufferSize)->all();
    $nextCursor = ! empty($sorted) ? base64_encode(json_encode($cursors)) : null;

    return ['posts' => $sorted, 'next_cursor' => $nextCursor];
}

/** @internal exposed for testing only */
public function fetchMastodonStatusesPublic(SocialAccount $account, array $statuses, callable $idExtractor): array
{
    return $this->fetchMastodonStatuses($account, $statuses, $idExtractor);
}

private function fetchMastodonStatuses(SocialAccount $account, array $statuses, callable $idExtractor): array
{
    $batchById = array_column($statuses, null, 'id');
    $ids = array_filter(array_unique(array_map($idExtractor, $statuses)));

    $result = [];
    foreach ($ids as $id) {
        if (isset($batchById[$id])) {
            $result[$id] = $batchById[$id];
        } else {
            $fetched = $this->mastodon->getStatus($account, $id);
            if ($fetched !== null) {
                $result[$id] = $fetched;
            }
        }
    }

    return $result;
}
```

- [ ] **Step 4: Run tests**

```bash
./vendor/bin/pest tests/Unit/Feed/FeedAggregatorTest.php
```

Expected: PASS (2 tests).

- [ ] **Step 5: Run full suite to check no regressions**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/FeedAggregator.php tests/Unit/Feed/FeedAggregatorTest.php
git commit -m "🔄️ Generalise fetchMastodonParents into fetchMastodonStatuses with callable extractor"
```

---

### Task 2: Add `mastodonQuotedPost()` to PostNormalizer

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write failing tests**

Append to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('sets quoted_post from inline mastodon quote field', function () {
    $status = [
        'id' => '1',
        'content' => '<p>my comment</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote' => [
            'id' => '99',
            'content' => '<p>the quoted post</p>',
            'created_at' => '2024-01-14T09:00:00.000Z',
            'url' => 'https://mastodon.social/@author/99',
            'account' => [
                'display_name' => 'Quoted Author',
                'acct' => 'author',
                'avatar' => 'https://mastodon.social/avatars/author.jpg',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['quoted_post'])->toBe([
        'author_name' => 'Quoted Author',
        'author_handle' => '@author@mastodon.social',
        'author_avatar' => 'https://mastodon.social/avatars/author.jpg',
        'original_url' => 'https://mastodon.social/@author/99',
        'body' => 'the quoted post',
        'created_at' => '2024-01-14T09:00:00.000Z',
    ]);
});

it('sets quoted_post from pre-fetched quote status when no inline quote field', function () {
    $status = [
        'id' => '1',
        'content' => '<p>my comment</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote_id' => '99',
    ];

    $quoteStatus = [
        'id' => '99',
        'content' => '<p>the quoted post</p>',
        'created_at' => '2024-01-14T09:00:00.000Z',
        'url' => 'https://mastodon.social/@author/99',
        'account' => [
            'display_name' => 'Quoted Author',
            'acct' => 'author',
            'avatar' => 'https://mastodon.social/avatars/author.jpg',
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', quoteStatus: $quoteStatus);

    expect($post['quoted_post'])->toBe([
        'author_name' => 'Quoted Author',
        'author_handle' => '@author@mastodon.social',
        'author_avatar' => 'https://mastodon.social/avatars/author.jpg',
        'original_url' => 'https://mastodon.social/@author/99',
        'body' => 'the quoted post',
        'created_at' => '2024-01-14T09:00:00.000Z',
    ]);
});

it('prefers inline quote field over pre-fetched quote status', function () {
    $status = [
        'id' => '1',
        'content' => '<p>my comment</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote_id' => '99',
        'quote' => [
            'id' => '99',
            'content' => '<p>inline quote body</p>',
            'created_at' => '2024-01-14T09:00:00.000Z',
            'url' => 'https://mastodon.social/@inline/99',
            'account' => ['display_name' => 'Inline Author', 'acct' => 'inline', 'avatar' => ''],
        ],
    ];

    $quoteStatus = [
        'id' => '99',
        'content' => '<p>fetched quote body</p>',
        'created_at' => '2024-01-14T09:00:00.000Z',
        'url' => 'https://mastodon.social/@fetched/99',
        'account' => ['display_name' => 'Fetched Author', 'acct' => 'fetched', 'avatar' => ''],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org', quoteStatus: $quoteStatus);

    expect($post['quoted_post']['author_name'])->toBe('Inline Author');
});

it('sets quoted_post to null when neither inline quote nor pre-fetched status is present', function () {
    $status = [
        'id' => '1',
        'content' => '<p>regular post</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['quoted_post'])->toBeNull();
});

it('does not double-append instance to federated mastodon quoted post author handle', function () {
    $status = [
        'id' => '1',
        'content' => '<p>quoting</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => ''],
        'media_attachments' => [],
        'quote' => [
            'id' => '99',
            'content' => '<p>remote post</p>',
            'created_at' => '2024-01-14T09:00:00.000Z',
            'url' => 'https://remote.social/@remote@remote.social/99',
            'account' => [
                'display_name' => 'Remote User',
                'acct' => 'remote@remote.social',
                'avatar' => '',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['quoted_post']['author_handle'])->toBe('@remote@remote.social');
});

it('sets quoted_post from inline quote on a boosted mastodon status', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'url' => 'https://fosstodon.org/@booster/999',
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => ''],
        'media_attachments' => [],
        'reblog' => [
            'id' => '1',
            'content' => '<p>boosted quote post</p>',
            'created_at' => '2024-01-15T10:00:00.000Z',
            'url' => 'https://mastodon.social/@original/1',
            'account' => ['display_name' => 'Original', 'acct' => 'original', 'avatar' => ''],
            'media_attachments' => [],
            'quote' => [
                'id' => '99',
                'content' => '<p>the quoted post</p>',
                'created_at' => '2024-01-14T09:00:00.000Z',
                'url' => 'https://mastodon.social/@quoted/99',
                'account' => ['display_name' => 'Quoted Author', 'acct' => 'quoted', 'avatar' => ''],
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromMastodon($status, 'fosstodon.org');

    expect($post['quoted_post']['author_name'])->toBe('Quoted Author');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./vendor/bin/pest --filter="mastodon quote"
```

Expected: FAIL — method signature mismatch / `quoted_post` is always null.

- [ ] **Step 3: Add `$quoteStatus` parameter and `mastodonQuotedPost()` method to PostNormalizer**

Update `fromMastodon` signature:

```php
public function fromMastodon(array $status, string $host, ?array $parentStatus = null, string $sourceHandle = '', ?array $quoteStatus = null): array
```

Replace `'quoted_post' => null,` with:

```php
'quoted_post' => $this->mastodonQuotedPost($source, $host, $quoteStatus),
```

Add the new private method (after `mastodonReplyTo`):

```php
private function mastodonQuotedPost(array $source, string $host, ?array $quoteStatus): ?array
{
    $raw = $source['quote'] ?? $quoteStatus;

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
        'body' => $this->truncateBody($this->extractBody($raw['content'] ?? '')),
        'created_at' => $raw['created_at'] ?? null,
    ];
}
```

- [ ] **Step 4: Run the new tests**

```bash
./vendor/bin/pest --filter="mastodon quote"
```

Expected: all 6 new tests PASS.

- [ ] **Step 5: Run full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Add Mastodon quoted post support (inline quote + quote_id fetch)"
```

---

### Task 3: Wire up and close

- [ ] **Step 1: Run full test suite one final time**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 2: Push and open PR**

```bash
git push -u origin feature/mastodon-quoted-posts
gh pr create --draft --title "Add Mastodon quoted post support" --body "$(cat <<'EOF'
Closes #29

## Summary

- Generalise `fetchMastodonParents` → `fetchMastodonStatuses(account, statuses, idExtractor)` in `FeedAggregator`
- Fetch quoted statuses via `quote_id` using the same pattern as reply parents
- Add `mastodonQuotedPost()` to `PostNormalizer`: checks inline `quote` field first, falls back to pre-fetched status
- Handles federated author handles (no double instance suffix)
- No frontend changes needed — existing `QuotedPost` rendering handles it

## Test plan
- [ ] All 170+ PHP tests pass
- [ ] Inline `quote` field renders quoted post in UI
- [ ] `quote_id`-only posts fetch and render the quoted post
- [ ] Federated handles display correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
