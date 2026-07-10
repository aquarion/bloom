# Boosted Post Age Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter boosted posts by the date of the boost event, not the original post date, falling back to the original post date when the boost date is unavailable.

**Architecture:** Single method change in `FeedAggregator::applyAgeCutoff`. The normalized post array already carries `boosted_by_created_at` (set by `PostNormalizer` for both Mastodon and Bluesky). The new logic picks that date for boosted posts, falling back to `created_at` if it's null.

**Tech Stack:** PHP 8.4, Laravel 13, Pest 4

---

## File Map

- Modify: `app/Services/Feed/FeedAggregator.php` — `applyAgeCutoff` method only
- Modify: `tests/Unit/Feed/FeedAggregatorTest.php` — update one existing test description; add two new tests

---

### Task 1: Add a failing test for old boost being filtered

The current `applyAgeCutoff` exempts ALL boosted posts. We need a test asserting that a boost whose *boost event* is older than `max_age_days` is filtered out. This test must fail before the implementation change.

**Files:**
- Modify: `tests/Unit/Feed/FeedAggregatorTest.php`

- [ ] **Step 1: Add the failing test after the existing "keeps boosted posts" test (around line 408)**

Add this test to `tests/Unit/Feed/FeedAggregatorTest.php`:

```php
it('filters boosted post when boost event is older than max_age_days', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $oldDate = now()->subDays(10)->toIso8601String();

    $boostedOldStatus = [
        'id' => '200',
        'created_at' => $oldDate, // boost event is old
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '100',
            'created_at' => $oldDate, // original post is also old
            'in_reply_to_id' => null,
            'url' => 'https://fosstodon.org/@author/100',
            'content' => '<p>old boosted post</p>',
            'spoiler_text' => '',
            'sensitive' => false,
            'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
            'media_attachments' => [],
            'emojis' => [],
            'card' => null,
            'quote' => null,
            'quote_id' => null,
            'tags' => [],
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$boostedOldStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(0);
});
```

- [ ] **Step 2: Run the new test to confirm it currently fails**

```bash
php artisan test --compact --filter="filters boosted post when boost event is older"
```

Expected: **FAIL** — the test asserts 0 posts but the current code returns 1 (boost exempt).

---

### Task 2: Add a failing test for null `boosted_by_created_at` falling back to post age

When `boosted_by_created_at` is null (outer status has no `created_at`), the filter must fall back to the original post's `created_at`. A recent original post should pass; an old one should be filtered.

**Files:**
- Modify: `tests/Unit/Feed/FeedAggregatorTest.php`

- [ ] **Step 1: Add two tests covering the null-fallback cases**

Add these tests after the test from Task 1:

```php
it('keeps boosted post when boosted_by_created_at is null and post is recent', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $recentDate = now()->subDays(2)->toIso8601String();

    // Outer status intentionally has no created_at → boosted_by_created_at will be null
    $boostedStatus = [
        'id' => '300',
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '150',
            'created_at' => $recentDate,
            'in_reply_to_id' => null,
            'url' => 'https://fosstodon.org/@author/150',
            'content' => '<p>recent post boosted without timestamp</p>',
            'spoiler_text' => '',
            'sensitive' => false,
            'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
            'media_attachments' => [],
            'emojis' => [],
            'card' => null,
            'quote' => null,
            'quote_id' => null,
            'tags' => [],
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$boostedStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1);
});

it('filters boosted post when boosted_by_created_at is null and post is old', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $oldDate = now()->subDays(10)->toIso8601String();

    // Outer status intentionally has no created_at → boosted_by_created_at will be null
    $boostedStatus = [
        'id' => '400',
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '200',
            'created_at' => $oldDate,
            'in_reply_to_id' => null,
            'url' => 'https://fosstodon.org/@author/200',
            'content' => '<p>old post boosted without timestamp</p>',
            'spoiler_text' => '',
            'sensitive' => false,
            'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
            'media_attachments' => [],
            'emojis' => [],
            'card' => null,
            'quote' => null,
            'quote_id' => null,
            'tags' => [],
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$boostedStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(0);
});
```

- [ ] **Step 2: Run the new tests to confirm which fail**

```bash
php artisan test --compact --filter="boosted_by_created_at is null"
```

Expected: The "recent post" test **PASSES** (current code exempts all boosts) and the "old post" test **FAILS** (current code exempts all boosts, but we expect 0).

---

### Task 3: Implement the new `applyAgeCutoff` logic

**Files:**
- Modify: `app/Services/Feed/FeedAggregator.php`

- [ ] **Step 1: Replace the `applyAgeCutoff` method body**

In `app/Services/Feed/FeedAggregator.php`, replace the current `applyAgeCutoff` method (lines ~281–301) with:

```php
private function applyAgeCutoff(array $posts, ?int $maxAgeDays): array
{
    if ($maxAgeDays === null) {
        return $posts;
    }

    $cutoff = now()->subDays($maxAgeDays);

    return array_values(array_filter($posts, function (array $post) use ($cutoff) {
        $isBoosted = ($post['boosted_by'] ?? null) !== null;
        $dateToCheck = $isBoosted
            ? ($post['boosted_by_created_at'] ?? $post['created_at'] ?? null)
            : ($post['created_at'] ?? null);

        if ($dateToCheck === null) {
            return false;
        }

        return Carbon::parse($dateToCheck)->gte($cutoff);
    }));
}
```

- [ ] **Step 2: Run Pint to fix formatting**

```bash
vendor/bin/pint app/Services/Feed/FeedAggregator.php --format agent
```

---

### Task 4: Run all affected tests and update the stale test description

- [ ] **Step 1: Run the full FeedAggregator test file**

```bash
php artisan test --compact tests/Unit/Feed/FeedAggregatorTest.php
```

Expected: all tests pass. If the "keeps boosted posts regardless of age" test still passes (it will — its boost event date is `now()`), that is correct.

- [ ] **Step 2: Rename the stale test description**

In `tests/Unit/Feed/FeedAggregatorTest.php`, find the test at line ~363:

```php
it('keeps boosted posts regardless of age', function () {
```

Change it to:

```php
it('keeps boosted post when boost event is recent even if original post is old', function () {
```

- [ ] **Step 3: Run the full test suite**

```bash
php artisan test --compact
```

Expected: all tests pass.

---

### Task 5: Commit

- [ ] **Step 1: Stage and commit**

```bash
git add app/Services/Feed/FeedAggregator.php tests/Unit/Feed/FeedAggregatorTest.php
git commit -m "🪳 Filter boosted posts by boost event date, not original post date"
```
