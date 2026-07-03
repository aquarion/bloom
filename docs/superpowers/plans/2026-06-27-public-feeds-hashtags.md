# Public Feeds & Hashtag Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public Mastodon timelines and Bluesky algorithmic feeds as subscribable sources, and make hashtag pills link out to the source platform.

**Architecture:** Extend `social_accounts` with a `feed_type` column (`home` / `public_mastodon` / `bluesky_feed`); `FeedAggregator` branches on `feed_type` in its existing account loop. Hashtag links are a frontend-only change to `PostAnimator.tsx` using a new `source_instance` field on the normalized post.

**Tech Stack:** Laravel 11, Pest, React 18, TypeScript, Inertia.js, Wayfinder (auto-generates TS route files from PHP routes on `npm run dev`)

---

## File Map

**Created:**
- `database/migrations/2026_06_27_000001_add_feed_type_to_social_accounts.php`

**Modified:**
- `app/Models/SocialAccount.php` — add `feed_type` to `$fillable`
- `database/factories/SocialAccountFactory.php` — add `publicMastodon()` and `blueskyFeed()` states
- `app/Services/Mastodon/MastodonFeedService.php` — add `getPublicTimeline()`
- `app/Services/Bluesky/BlueskyFeedService.php` — add `getFeed()`
- `app/Services/Feed/PostNormalizer.php` — add `source_instance` to both `fromMastodon()` and `fromBluesky()`
- `app/Services/Feed/FeedAggregator.php` — add `public_mastodon` and `bluesky_feed` branches
- `app/Http/Controllers/Social/ConnectionsController.php` — add `storePublicMastodon()` and `storeBlueskyFeed()`
- `routes/settings.php` — add two new POST routes
- `resources/js/types/post.ts` — add `source_instance: string | null`
- `resources/js/components/feed/PostAnimator.tsx` — make hashtag pills into `<a>` links
- `resources/js/pages/settings/connections.tsx` — add public Mastodon and Bluesky feed forms

**Test files modified:**
- `tests/Feature/Social/MastodonFeedServiceTest.php`
- `tests/Feature/Social/BlueskyFeedServiceTest.php`
- `tests/Unit/Feed/FeedAggregatorTest.php`
- `tests/Feature/Settings/ConnectionsTest.php` (create if absent)

---

## Task 1: Migration — add `feed_type`, make `access_token`/`handle` nullable

**Files:**
- Create: `database/migrations/2026_06_27_000001_add_feed_type_to_social_accounts.php`

- [ ] **Step 1: Write the migration**

Follow the same defensive pattern as `2026_05_27_140458_update_social_accounts_for_multi_account.php`: wrap each schema change in a try/catch that re-throws on anything other than "already exists / duplicate" errors, so partial re-runs don't abort.

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add feed_type column — idempotent: skip if it already exists
        try {
            if (! Schema::hasColumn('social_accounts', 'feed_type')) {
                Schema::table('social_accounts', function (Blueprint $table) {
                    $table->string('feed_type')->default('home')->after('provider');
                });
            }
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), 'Duplicate column name')
                && ! str_contains($e->getMessage(), 'already exists')) {
                throw $e;
            }
        }

        // Make access_token nullable (was non-nullable text)
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->text('access_token')->nullable()->change();
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), 'already')) {
                throw $e;
            }
        }

        // Make handle nullable (was non-nullable string)
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->string('handle')->nullable()->change();
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), 'already')) {
                throw $e;
            }
        }
    }

    public function down(): void
    {
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropColumn('feed_type');
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), "Can't DROP")
                && ! str_contains($e->getMessage(), 'no such column')) {
                throw $e;
            }
        }

        Schema::table('social_accounts', function (Blueprint $table) {
            $table->text('access_token')->nullable(false)->change();
            $table->string('handle')->nullable(false)->change();
        });
    }
};
```

- [ ] **Step 2: Run the migration**

```bash
php artisan migrate
```

Expected: `Migrated: 2026_06_27_000001_add_feed_type_to_social_accounts`

- [ ] **Step 3: Update `SocialAccount` model**

In `app/Models/SocialAccount.php`, add `'feed_type'` to the `$fillable` array:

```php
protected $fillable = [
    'user_id', 'provider', 'feed_type', 'instance_url',
    'access_token', 'token_secret', 'handle',
    'auth_failed_at', 'feed_settings',
];
```

- [ ] **Step 4: Add factory states**

In `database/factories/SocialAccountFactory.php`, add two named states after the `definition()` method:

```php
public function publicMastodon(string $instanceUrl = 'https://social.example'): static
{
    return $this->state([
        'provider' => 'mastodon',
        'feed_type' => 'public_mastodon',
        'instance_url' => $instanceUrl,
        'access_token' => null,
        'handle' => null,
    ]);
}

public function blueskyFeed(string $feedUri = 'at://did:plc:test/app.bsky.feed.generator/whats-hot'): static
{
    return $this->state([
        'provider' => 'bluesky',
        'feed_type' => 'bluesky_feed',
        'instance_url' => 'https://pds.example',
        'access_token' => null,
        'handle' => null,
        'feed_settings' => ['feed_uri' => $feedUri],
    ]);
}
```

- [ ] **Step 5: Run the full test suite to confirm nothing broke**

```bash
./vendor/bin/pest
```

Expected: all existing tests pass (the migration only adds nullable/default columns).

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_06_27_000001_add_feed_type_to_social_accounts.php \
        app/Models/SocialAccount.php \
        database/factories/SocialAccountFactory.php
git commit -m "🔄️ Add feed_type to social_accounts, make access_token/handle nullable"
```

---

## Task 2: `MastodonFeedService::getPublicTimeline`

**Files:**
- Modify: `app/Services/Mastodon/MastodonFeedService.php`
- Test: `tests/Feature/Social/MastodonFeedServiceTest.php`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Feature/Social/MastodonFeedServiceTest.php`:

```php
it('returns public timeline statuses without a token', function () {
    Http::fake([
        'social.example/api/v1/timelines/public*' => Http::response([
            ['id' => '1', 'content' => '<p>Hello</p>', 'created_at' => now()->toIso8601String()],
        ], 200),
    ]);

    $service = new MastodonFeedService;
    $result = $service->getPublicTimeline('https://social.example', 20);

    expect($result)->toHaveCount(1)
        ->and($result[0]['id'])->toBe('1');

    Http::assertSent(fn ($request) =>
        str_contains($request->url(), '/api/v1/timelines/public')
        && ! $request->hasHeader('Authorization')
    );
});

it('returns null when public timeline returns 401', function () {
    Http::fake([
        'social.example/api/v1/timelines/public*' => Http::response(
            ['error' => 'This API requires an authenticated user'], 401
        ),
    ]);

    $service = new MastodonFeedService;
    $result = $service->getPublicTimeline('https://social.example', 20);

    expect($result)->toBeNull();
});

it('caches public timeline without user tag', function () {
    Http::fake([
        'social.example/api/v1/timelines/public*' => Http::sequence()
            ->push([['id' => '1', 'content' => '<p>Hi</p>']], 200)
            ->push([['id' => '2', 'content' => '<p>Cached</p>']], 200),
    ]);

    $service = new MastodonFeedService;
    $service->getPublicTimeline('https://social.example', 20);
    $second = $service->getPublicTimeline('https://social.example', 20);

    // Second call returns cached result (id 1, not 2)
    expect($second[0]['id'])->toBe('1');
    Http::assertSentCount(1);
});
```

- [ ] **Step 2: Run failing tests**

```bash
./vendor/bin/pest tests/Feature/Social/MastodonFeedServiceTest.php --filter="public timeline"
```

Expected: 3 failures — method not found.

- [ ] **Step 3: Implement `getPublicTimeline`**

Add this method to `app/Services/Mastodon/MastodonFeedService.php` after `getHomeTimeline`:

```php
/**
 * Fetch the public timeline for a Mastodon instance without authentication.
 * Returns null if the instance requires auth (401). Cached app-wide (not per-user).
 */
public function getPublicTimeline(string $instanceUrl, int $limit = 20): ?array
{
    $host = parse_url($instanceUrl, PHP_URL_HOST) ?? $instanceUrl;
    $dataKey = "mastodon:public:{$host}:head:data";
    $freshKey = "mastodon:public:{$host}:head:fresh";

    if (Cache::has($freshKey)) {
        return Cache::get($dataKey) ?? [];
    }

    $existing = Cache::get($dataKey);
    $params = ['limit' => $limit];

    if (! empty($existing)) {
        $params['since_id'] = $existing[0]['id'];
    }

    try {
        $response = Http::timeout(15)
            ->get("{$instanceUrl}/api/v1/timelines/public", $params);

        if ($response->status() === 401) {
            return null;
        }

        $response->throw();
    } catch (\Throwable $e) {
        if (isset($response) && $response->status() === 401) {
            return null;
        }
        throw $e;
    }

    $fetched = $response->json();

    $merged = ! empty($existing)
        ? array_slice(array_merge($fetched, $existing), 0, $limit)
        : $fetched;

    Cache::put($dataKey, $merged, self::TIMELINE_DATA_TTL);
    Cache::put($freshKey, true, self::TIMELINE_TTL);

    return $merged;
}
```

- [ ] **Step 4: Run the tests**

```bash
./vendor/bin/pest tests/Feature/Social/MastodonFeedServiceTest.php --filter="public timeline"
```

Expected: all 3 pass.

- [ ] **Step 5: Run full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Mastodon/MastodonFeedService.php \
        tests/Feature/Social/MastodonFeedServiceTest.php
git commit -m "🎇 Add MastodonFeedService::getPublicTimeline with app-wide caching"
```

---

## Task 3: `BlueskyFeedService::getFeed`

**Files:**
- Modify: `app/Services/Bluesky/BlueskyFeedService.php`
- Test: `tests/Feature/Social/BlueskyFeedServiceTest.php`

- [ ] **Step 1: Write the failing tests**

Append to `tests/Feature/Social/BlueskyFeedServiceTest.php`:

```php
it('calls getFeed with the correct feed uri and returns posts and cursor', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'access_token' => 'test-token',
    ]);

    Http::fake([
        '*/app.bsky.feed.getFeed*' => Http::response([
            'feed' => [
                ['post' => ['uri' => 'at://did/app.bsky.feed.post/abc', 'record' => ['text' => 'Hello', '$type' => 'app.bsky.feed.post', 'createdAt' => now()->toIso8601String()], 'author' => ['did' => 'did:plc:1', 'handle' => 'alice.test', 'displayName' => 'Alice']]],
            ],
            'cursor' => 'cursor123',
        ], 200),
    ]);

    $auth = Mockery::mock(\App\Services\Bluesky\BlueskyAuthService::class);
    $auth->shouldReceive('getToken')
        ->with($account)
        ->andReturn('test-token');

    $service = new \App\Services\Bluesky\BlueskyFeedService($auth);
    $result = $service->getFeed($account, 'at://did:plc:test/app.bsky.feed.generator/whats-hot', 20);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['cursor'])->toBe('cursor123');

    Http::assertSent(fn ($request) =>
        str_contains($request->url(), 'getFeed') &&
        str_contains($request->url(), 'whats-hot')
    );
});
```

- [ ] **Step 2: Run failing test**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyFeedServiceTest.php --filter="getFeed"
```

Expected: FAIL — method not found.

- [ ] **Step 3: Implement `getFeed`**

Add after `getHomeTimeline` in `app/Services/Bluesky/BlueskyFeedService.php`:

```php
public function getFeed(SocialAccount $account, string $feedUri, int $limit = 20, ?string $cursor = null): array
{
    $params = ['feed' => $feedUri, 'limit' => $limit];
    if ($cursor !== null) {
        $params['cursor'] = $cursor;
    }

    $cacheKey = 'bluesky:feed:'.$account->id.':'.md5($feedUri).':'.($cursor ?? 'head');

    $result = Cache::tags(["user:{$account->user_id}"])->remember($cacheKey, self::TIMELINE_TTL, function () use ($account, $params) {
        $response = $this->request($account, fn (string $token) => Http::withToken($token)
            ->get(self::BASE.'/app.bsky.feed.getFeed', $params)
            ->throw()
            ->json()
        );

        return [
            'posts' => $response['feed'] ?? [],
            'cursor' => $response['cursor'] ?? null,
        ];
    });

    $result['posts'] = $this->enrichWithBanners($result['posts'], $account);

    return $result;
}
```

- [ ] **Step 4: Run the test**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyFeedServiceTest.php --filter="getFeed"
```

Expected: PASS.

- [ ] **Step 5: Run full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Bluesky/BlueskyFeedService.php \
        tests/Feature/Social/BlueskyFeedServiceTest.php
git commit -m "🎇 Add BlueskyFeedService::getFeed for algorithmic feeds"
```

---

## Task 4: Add `source_instance` to PostNormalizer

**Files:**
- Modify: `app/Services/Feed/PostNormalizer.php`
- Test: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write failing tests**

Append to `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('includes source_instance from the mastodon host', function () {
    $status = [
        'id' => '1',
        'content' => '<p>Hello</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://social.example/@alice/1',
        'account' => ['display_name' => 'Alice', 'acct' => 'alice', 'avatar' => '', 'header' => '', 'emojis' => []],
        'media_attachments' => [], 'tags' => [], 'mentions' => [], 'emojis' => [],
        'sensitive' => false, 'spoiler_text' => '', 'card' => null, 'reblog' => null,
    ];

    $result = (new PostNormalizer)->fromMastodon($status, 'social.example');

    expect($result['source_instance'])->toBe('social.example');
});

it('sets source_instance to null for bluesky posts', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:1/app.bsky.feed.post/abc',
            'record' => ['$type' => 'app.bsky.feed.post', 'text' => 'Hello', 'createdAt' => '2024-01-15T10:00:00.000Z'],
            'author' => ['did' => 'did:plc:1', 'handle' => 'alice.test', 'displayName' => 'Alice', 'avatar' => ''],
            'indexedAt' => '2024-01-15T10:00:00.000Z',
        ],
    ];

    $result = (new PostNormalizer)->fromBluesky($feedPost);

    expect($result['source_instance'])->toBeNull();
});
```

- [ ] **Step 2: Run failing tests**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="source_instance"
```

Expected: FAIL — key not found.

- [ ] **Step 3: Add `source_instance` to `fromMastodon`**

In `app/Services/Feed/PostNormalizer.php`, inside the `fromMastodon` return array (after `'source_handle'`):

```php
'source_instance' => $host,
```

- [ ] **Step 4: Add `source_instance` to `fromBluesky`**

In the `fromBluesky` return array (after `'source_handle'`):

```php
'source_instance' => null,
```

- [ ] **Step 5: Run the tests**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="source_instance"
```

Expected: both pass.

- [ ] **Step 6: Run full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php \
        tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🔄️ Add source_instance to normalized post shape"
```

---

## Task 5: FeedAggregator — `public_mastodon` and `bluesky_feed` branches

**Files:**
- Modify: `app/Services/Feed/FeedAggregator.php`
- Test: `tests/Unit/Feed/FeedAggregatorTest.php`

- [ ] **Step 1: Write failing tests**

Append to `tests/Unit/Feed/FeedAggregatorTest.php`:

```php
it('fetches public mastodon timeline without token', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->publicMastodon()->create(['user_id' => $user->id]);

    $rawStatus = ['id' => '1', 'content' => '<p>Public post</p>', 'created_at' => now()->toIso8601String(),
        'account' => ['display_name' => 'Alice', 'acct' => 'alice', 'avatar' => '', 'header' => '', 'emojis' => []],
        'media_attachments' => [], 'tags' => [], 'mentions' => [], 'emojis' => [], 'sensitive' => false, 'spoiler_text' => '',
        'url' => 'https://social.example/@alice/1', 'card' => null, 'reblog' => null, 'in_reply_to_id' => null,
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getPublicTimeline')
        ->once()
        ->with('https://social.example', Mockery::any())
        ->andReturn([$rawStatus]);
    $mastodon->shouldNotReceive('getHomeTimeline');

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        new PostNormalizer,
    );

    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1);
});

it('falls back to home timeline when public mastodon returns null (auth required)', function () {
    $user = User::factory()->create();
    $publicAccount = SocialAccount::factory()->publicMastodon('https://other.example')->create(['user_id' => $user->id]);
    $homeAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://other.example',
        'access_token' => 'token',
    ]);

    $rawStatus = ['id' => '1', 'content' => '<p>Authed post</p>', 'created_at' => now()->toIso8601String(),
        'account' => ['display_name' => 'Bob', 'acct' => 'bob', 'avatar' => '', 'header' => '', 'emojis' => []],
        'media_attachments' => [], 'tags' => [], 'mentions' => [], 'emojis' => [], 'sensitive' => false, 'spoiler_text' => '',
        'url' => 'https://other.example/@bob/1', 'card' => null, 'reblog' => null, 'in_reply_to_id' => null,
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getPublicTimeline')
        ->once()
        ->with('https://other.example', Mockery::any())
        ->andReturn(null);
    $mastodon->shouldReceive('getHomeTimeline')
        ->once()
        ->with($homeAccount, Mockery::any(), null)
        ->andReturn([$rawStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        new PostNormalizer,
    );

    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1);
});

it('fetches bluesky algorithmic feed using the home account token', function () {
    $user = User::factory()->create();
    $homeAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'access_token' => 'token',
    ]);
    $feedUri = 'at://did:plc:test/app.bsky.feed.generator/whats-hot';
    $feedAccount = SocialAccount::factory()->blueskyFeed($feedUri)->create(['user_id' => $user->id]);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getFeed')
        ->once()
        ->with($homeAccount, $feedUri, Mockery::any(), null)
        ->andReturn(['posts' => [], 'cursor' => null]);
    $bluesky->shouldNotReceive('getHomeTimeline');

    $aggregator = new FeedAggregator(
        Mockery::mock(MastodonFeedService::class),
        $bluesky,
        new PostNormalizer,
    );

    $result = $aggregator->fetch($user);
    expect($result['posts'])->toBeEmpty();
});

it('skips bluesky feed account when no home bluesky account exists', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->blueskyFeed()->create(['user_id' => $user->id]);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldNotReceive('getFeed');
    $bluesky->shouldNotReceive('getHomeTimeline');

    $aggregator = new FeedAggregator(
        Mockery::mock(MastodonFeedService::class),
        $bluesky,
        new PostNormalizer,
    );

    $result = $aggregator->fetch($user);
    expect($result['posts'])->toBeEmpty();
});
```

- [ ] **Step 2: Run failing tests**

```bash
./vendor/bin/pest tests/Unit/Feed/FeedAggregatorTest.php --filter="public mastodon|bluesky.*feed|falls back"
```

Expected: all fail — branches don't exist yet.

- [ ] **Step 3: Implement the branches in `FeedAggregator::fetch`**

In `app/Services/Feed/FeedAggregator.php`, update the `fetch` method. Replace the `foreach` body:

```php
foreach ($user->socialAccounts as $account) {
    $accountCursor = $cursors[$account->id] ?? null;
    $normalised = [];
    $nextCursor = null;

    try {
        $feedType = $account->feed_type ?? 'home';

        if ($feedType === 'public_mastodon') {
            $host = parse_url($account->instance_url, PHP_URL_HOST);
            $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
            $statuses = $this->mastodon->getPublicTimeline($account->instance_url, $perAccountLimit);

            if ($statuses === null) {
                // Instance requires auth — try the user's home Mastodon account for this instance
                $fallback = $user->socialAccounts->first(fn ($a) =>
                    ($a->feed_type ?? 'home') === 'home'
                    && $a->provider === 'mastodon'
                    && parse_url($a->instance_url, PHP_URL_HOST) === $host
                );

                if ($fallback) {
                    $statuses = $this->mastodon->getHomeTimeline($fallback, $perAccountLimit, $accountCursor);
                    $account->update(['auth_failed_at' => null]);
                } else {
                    $account->update(['auth_failed_at' => now()]);
                    Log::warning('Public Mastodon timeline requires auth and no fallback account exists', [
                        'account_id' => $account->id,
                        'instance_url' => $account->instance_url,
                    ]);
                    continue;
                }
            }

            $parents = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['in_reply_to_id'] ?? null);
            $normalised = array_map(fn ($s) => $this->normalizer->fromMastodon($s, $host, $parents[$s['in_reply_to_id'] ?? ''] ?? null, '', null, false), $statuses);
            $nextCursor = ! empty($statuses) ? end($statuses)['id'] : null;

        } elseif ($feedType === 'bluesky_feed') {
            $feedUri = $account->getPreference('feed_uri');
            if (! $feedUri) {
                Log::warning('Bluesky feed account missing feed_uri', ['account_id' => $account->id]);
                continue;
            }

            $authAccount = $user->socialAccounts->first(fn ($a) =>
                ($a->feed_type ?? 'home') === 'home' && $a->provider === 'bluesky'
            );

            if (! $authAccount) {
                Log::warning('No home Bluesky account found for bluesky_feed', ['account_id' => $account->id]);
                continue;
            }

            $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
            $result = $this->bluesky->getFeed($authAccount, $feedUri, $perAccountLimit, $accountCursor);
            $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, '', false), $result['posts']);
            $nextCursor = $result['cursor'] ?: null;

        } elseif ($account->provider === 'mastodon') {
            $host = parse_url($account->instance_url, PHP_URL_HOST);
            $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
            $statuses = $this->mastodon->getHomeTimeline($account, $perAccountLimit, $accountCursor);

            $parents = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['in_reply_to_id'] ?? null);
            $quotes = $this->fetchMastodonStatuses($account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['quote_id'] ?? null);

            $normalised = array_map(function ($s) use ($host, $parents, $quotes, $account, $mentionsEnabled) {
                $source = $s['reblog'] ?? $s;
                $quoteId = $source['quote_id'] ?? null;

                return $this->normalizer->fromMastodon(
                    $s,
                    $host,
                    $parents[$source['in_reply_to_id'] ?? ''] ?? null,
                    $account->handle,
                    $quoteId ? ($quotes[$quoteId] ?? null) : null,
                    $mentionsEnabled,
                );
            }, $statuses);

            if ($mentionsEnabled) {
                $normalised = $this->mastodon->resolveMentionProfiles($normalised, $account);
            }

            $nextCursor = ! empty($statuses) ? end($statuses)['id'] : null;

        } elseif ($account->provider === 'bluesky') {
            $perAccountLimit = $account->getPreference('max_posts', $defaultLimit);
            $result = $this->bluesky->getHomeTimeline($account, $perAccountLimit, $accountCursor);
            $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, $account->handle, $mentionsEnabled), $result['posts']);

            if ($mentionsEnabled) {
                $normalised = $this->bluesky->resolveMentionProfiles($normalised, $account);
            }

            $nextCursor = $result['cursor'] ?: null;
        }
    } catch (\Throwable $e) {
        Log::warning('Failed to fetch feed for account', [
            'account_id' => $account->id,
            'provider' => $account->provider,
            'feed_type' => $account->feed_type ?? 'home',
            'error' => $e->getMessage(),
        ]);

        continue;
    }

    $normalised = $this->applyAgeCutoff($normalised, $this->resolveMaxAgeDays($user, $account));
    $posts = $posts->concat($normalised);
    if ($nextCursor) {
        $cursors[$account->id] = $nextCursor;
    }
}
```

- [ ] **Step 4: Run the new tests**

```bash
./vendor/bin/pest tests/Unit/Feed/FeedAggregatorTest.php --filter="public mastodon|bluesky.*feed|falls back"
```

Expected: all pass.

- [ ] **Step 5: Run full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/FeedAggregator.php \
        tests/Unit/Feed/FeedAggregatorTest.php
git commit -m "🎇 Add public_mastodon and bluesky_feed branches to FeedAggregator"
```

---

## Task 6: ConnectionsController routes and handlers

**Files:**
- Modify: `app/Http/Controllers/Social/ConnectionsController.php`
- Modify: `routes/settings.php`
- Test: `tests/Feature/Settings/ConnectionsTest.php`

- [ ] **Step 1: Write failing tests**

Create (or append to) `tests/Feature/Settings/ConnectionsTest.php`:

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('stores a public mastodon feed', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->post('/auth/public-mastodon', ['instance_url' => 'social.example']);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'public-mastodon-added');

    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'feed_type' => 'public_mastodon',
        'instance_url' => 'https://social.example',
    ]);
});

it('does not create duplicate public mastodon feed for same instance', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->publicMastodon()->create(['user_id' => $user->id]);

    $this->actingAs($user)
        ->post('/auth/public-mastodon', ['instance_url' => 'social.example'])
        ->assertSessionHas('status', 'public-mastodon-already-added');

    expect(SocialAccount::where('user_id', $user->id)->count())->toBe(1);
});

it('stores a bluesky feed linked to the home account', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
    ]);

    $feedUrl = 'https://bsky.app/profile/did:plc:test/feed/whats-hot';

    $response = $this->actingAs($user)
        ->post('/auth/bluesky-feed', ['feed_url' => $feedUrl]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-feed-added');

    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'bluesky_feed',
    ]);

    $saved = SocialAccount::where('user_id', $user->id)
        ->where('feed_type', 'bluesky_feed')
        ->first();

    expect($saved->getPreference('feed_uri'))->toBe('at://did:plc:test/app.bsky.feed.generator/whats-hot');
});

it('rejects bluesky feed store when no home bluesky account exists', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post('/auth/bluesky-feed', ['feed_url' => 'https://bsky.app/profile/did:plc:test/feed/whats-hot'])
        ->assertRedirect()
        ->assertSessionHasErrors(['feed_url']);
});

it('rejects invalid bluesky feed url', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create(['user_id' => $user->id, 'provider' => 'bluesky', 'feed_type' => 'home']);

    $this->actingAs($user)
        ->post('/auth/bluesky-feed', ['feed_url' => 'not-a-url'])
        ->assertSessionHasErrors(['feed_url']);
});
```

- [ ] **Step 2: Run failing tests**

```bash
./vendor/bin/pest tests/Feature/Settings/ConnectionsTest.php
```

Expected: all fail — routes don't exist.

- [ ] **Step 3: Add routes to `routes/settings.php`**

Inside the `Route::middleware(['auth', 'passkey.exists'])->group(...)` block, add after the existing Bluesky route:

```php
// Public Mastodon timeline
Route::post('auth/public-mastodon', [ConnectionsController::class, 'storePublicMastodon'])->name('public-mastodon.store');

// Bluesky algorithmic feed
Route::post('auth/bluesky-feed', [ConnectionsController::class, 'storeBlueskyFeed'])->name('bluesky-feed.store');
```

Also add `ConnectionsController` to the `use` imports at the top of `routes/settings.php` if not already imported (it already is).

- [ ] **Step 4: Implement handlers in `ConnectionsController`**

Replace the full contents of `app/Http/Controllers/Social/ConnectionsController.php`:

```php
<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use Illuminate\Http\Request;

class ConnectionsController extends Controller
{
    public function destroy(Request $request, SocialAccount $account)
    {
        abort_unless($account->user_id === $request->user()->id, 403);

        $provider = $account->provider;

        $account->delete();

        return redirect()->route('connections.edit')
            ->with('status', $provider.'-disconnected');
    }

    public function storePublicMastodon(Request $request)
    {
        $validated = $request->validate([
            'instance_url' => ['required', 'string', 'max:255'],
        ]);

        $host = strtolower(trim($validated['instance_url']));
        $host = preg_replace('#^https?://#', '', $host);
        $host = rtrim($host, '/');
        $instanceUrl = 'https://'.$host;

        $user = $request->user();

        $existing = $user->socialAccounts()
            ->where('provider', 'mastodon')
            ->where('feed_type', 'public_mastodon')
            ->where('instance_url', $instanceUrl)
            ->exists();

        if ($existing) {
            return redirect()->route('connections.edit')
                ->with('status', 'public-mastodon-already-added');
        }

        $user->socialAccounts()->create([
            'provider' => 'mastodon',
            'feed_type' => 'public_mastodon',
            'instance_url' => $instanceUrl,
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'public-mastodon-added');
    }

    public function storeBlueskyFeed(Request $request)
    {
        $user = $request->user();

        $hasHomeBluesky = $user->socialAccounts()
            ->where('provider', 'bluesky')
            ->where('feed_type', 'home')
            ->exists();

        if (! $hasHomeBluesky) {
            return back()->withErrors(['feed_url' => 'You need a connected Bluesky account to add a Bluesky feed.']);
        }

        $validated = $request->validate([
            'feed_url' => ['required', 'string', 'max:500'],
        ]);

        $feedUri = $this->blueskyFeedUrlToAtUri($validated['feed_url']);

        if ($feedUri === null) {
            return back()->withErrors(['feed_url' => 'Invalid Bluesky feed URL. Paste the full URL from bsky.app, e.g. https://bsky.app/profile/did:plc:.../feed/name']);
        }

        $user->socialAccounts()->create([
            'provider' => 'bluesky',
            'feed_type' => 'bluesky_feed',
            'instance_url' => 'https://bsky.social',
            'feed_settings' => ['feed_uri' => $feedUri],
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-feed-added');
    }

    /**
     * Convert https://bsky.app/profile/{did}/feed/{name} to at://{did}/app.bsky.feed.generator/{name}
     * Returns null for unrecognised URL formats.
     */
    private function blueskyFeedUrlToAtUri(string $url): ?string
    {
        // Accept an AT URI passed directly
        if (str_starts_with($url, 'at://')) {
            return $url;
        }

        // Parse https://bsky.app/profile/{did-or-handle}/feed/{generator-name}
        $parsed = parse_url($url);
        if (! isset($parsed['host']) || $parsed['host'] !== 'bsky.app') {
            return null;
        }

        $parts = array_values(array_filter(explode('/', $parsed['path'] ?? '')));
        // Expected: ['profile', '{did}', 'feed', '{name}']
        if (count($parts) < 4 || $parts[0] !== 'profile' || $parts[2] !== 'feed') {
            return null;
        }

        $did = $parts[1];
        $name = $parts[3];

        return "at://{$did}/app.bsky.feed.generator/{$name}";
    }
}
```

- [ ] **Step 5: Run the tests**

```bash
./vendor/bin/pest tests/Feature/Settings/ConnectionsTest.php
```

Expected: all pass.

- [ ] **Step 6: Run full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 7: Regenerate Wayfinder route files**

```bash
php artisan wayfinder:generate
```

Expected: new files appear under `resources/js/routes/` for the new routes.

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Social/ConnectionsController.php \
        routes/settings.php \
        tests/Feature/Settings/ConnectionsTest.php \
        resources/js/routes/
git commit -m "🎇 Add public Mastodon and Bluesky feed connection endpoints"
```

---

## Task 7: Frontend — hashtag links in `PostAnimator.tsx`

**Files:**
- Modify: `resources/js/types/post.ts`
- Modify: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Add `source_instance` to the `Post` type**

In `resources/js/types/post.ts`, add to the `Post` interface after `source_handle`:

```typescript
/** Mastodon instance hostname (e.g. "mastodon.social"), null for Bluesky. */
source_instance: string | null;
```

- [ ] **Step 2: Update hashtag rendering in `PostAnimator.tsx`**

Find the hashtag block (around line 527–544). Replace it with:

```tsx
{post.hashtags.length > 0 && (
    <div
        className="absolute top-0 left-full flex h-full flex-col items-center justify-center gap-1 overflow-hidden pl-3"
    >
        {[...new Set(post.hashtags)].map((tag) => {
            const href = post.source === 'mastodon' && post.source_instance
                ? `https://${post.source_instance}/tags/${encodeURIComponent(tag)}`
                : `https://bsky.app/search?q=%23${encodeURIComponent(tag)}`;

            return (
                <a
                    key={tag}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white/10 px-1.5 py-1.5 text-sm hover:bg-white/20"
                    style={{
                        color: textColor,
                        writingMode: 'vertical-rl',
                    }}
                >
                    #{tag}
                </a>
            );
        })}
    </div>
)}
```

Note: the `aria-hidden="true"` attribute is removed from the outer `div` since these are now interactive links.

- [ ] **Step 3: Run TypeScript type check**

```bash
npm run typecheck 2>/dev/null || npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to this change).

- [ ] **Step 4: Commit**

```bash
git add resources/js/types/post.ts \
        resources/js/components/feed/PostAnimator.tsx
git commit -m "🖼️ Make hashtag pills link out to platform hashtag pages"
```

---

## Task 8: Connections page UI

**Files:**
- Modify: `resources/js/pages/settings/connections.tsx`

- [ ] **Step 1: Update the `SocialConnection` interface**

In `resources/js/pages/settings/connections.tsx`, extend the `SocialConnection` interface:

```typescript
interface SocialConnection {
    id: number;
    provider: 'mastodon' | 'bluesky';
    feed_type: 'home' | 'public_mastodon' | 'bluesky_feed';
    handle: string | null;
    instance_url: string | null;
    auth_failed_at: string | null;
    feed_settings: {
        max_posts?: number;
        max_age_days?: number | null;
        feed_uri?: string;
    } | null;
}
```

- [ ] **Step 2: Update the connections page query in `routes/settings.php`**

In `routes/settings.php`, update the connections `GET` route to include `feed_type`:

```php
Route::get('settings/connections', function (Request $request) {
    return Inertia::render('settings/connections', [
        'connections' => $request->user()->socialAccounts()
            ->select('id', 'provider', 'feed_type', 'handle', 'instance_url', 'auth_failed_at', 'feed_settings')
            ->get(),
        'status' => $request->session()->get('status'),
    ]);
})->name('connections.edit');
```

- [ ] **Step 3: Add `AddPublicMastodonForm` component**

Add this component to `connections.tsx` before the `export default function Connections`:

```tsx
function AddPublicMastodonForm() {
    const { data, setData, post, processing, errors, reset } = useForm({
        instance_url: '',
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        post('/auth/public-mastodon', { onSuccess: () => reset() });
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
                <Label htmlFor="public_mastodon_instance">Instance URL</Label>
                <Input
                    id="public_mastodon_instance"
                    name="instance_url"
                    placeholder="mastodon.social"
                    value={data.instance_url}
                    onChange={(e) => setData('instance_url', e.target.value)}
                />
                <InputError message={errors.instance_url} />
            </div>
            <Button type="submit" disabled={processing}>
                Follow public timeline
            </Button>
        </form>
    );
}
```

- [ ] **Step 4: Add `AddBlueskyFeedForm` component**

Add this component after `AddPublicMastodonForm`:

```tsx
function AddBlueskyFeedForm() {
    const { data, setData, post, processing, errors, reset } = useForm({
        feed_url: '',
    });

    function submit(e: React.FormEvent) {
        e.preventDefault();
        post('/auth/bluesky-feed', { onSuccess: () => reset() });
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
                <Label htmlFor="bluesky_feed_url">Feed URL</Label>
                <Input
                    id="bluesky_feed_url"
                    name="feed_url"
                    placeholder="https://bsky.app/profile/did:plc:.../feed/whats-hot"
                    value={data.feed_url}
                    onChange={(e) => setData('feed_url', e.target.value)}
                />
                <InputError message={errors.feed_url} />
                <p className="text-muted-foreground text-xs">
                    Paste the full URL from a Bluesky feed page.
                </p>
            </div>
            <Button type="submit" disabled={processing}>
                Add feed
            </Button>
        </form>
    );
}
```

- [ ] **Step 5: Update the Mastodon section to show public feeds and add form**

Update the Mastodon section in the `Connections` component. Replace the existing connections list and add-account form:

```tsx
{/* Mastodon */}
<div className="rounded-lg border p-6">
    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
        <SiMastodon className="size-4" /> Mastodon
    </h3>

    {mastodonConnections.filter(c => c.feed_type === 'home').length > 0 && (
        <div className="mb-4">
            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Connected accounts
            </p>
            <ul className="space-y-2">
                {mastodonConnections.filter(c => c.feed_type === 'home').map((c) => (
                    <li key={c.id} data-testid={`account-${c.id}`} className="rounded-md border px-3 py-2">
                        {c.auth_failed_at ? (
                            <MastodonReauthForm connection={c} />
                        ) : (
                            <div>
                                <div className="flex items-center justify-between">
                                    <p className="text-muted-foreground text-sm">
                                        <strong>{c.handle}</strong>
                                        {c.instance_url && (
                                            <span className="ml-1 text-xs">({c.instance_url})</span>
                                        )}
                                    </p>
                                    <Form {...disconnectAccount.form({ account: c.id })}>
                                        {({ processing }) => (
                                            <Button type="submit" variant="destructive" size="sm" disabled={processing}>
                                                Disconnect
                                            </Button>
                                        )}
                                    </Form>
                                </div>
                                <AccountFeedSettings connection={c} />
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )}

    {mastodonConnections.filter(c => c.feed_type === 'public_mastodon').length > 0 && (
        <div className="mb-4">
            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Public timelines
            </p>
            <ul className="space-y-2">
                {mastodonConnections.filter(c => c.feed_type === 'public_mastodon').map((c) => (
                    <li key={c.id} data-testid={`account-${c.id}`} className="rounded-md border px-3 py-2">
                        <div className="flex items-center justify-between">
                            {c.auth_failed_at ? (
                                <p className="text-amber-600 text-sm">
                                    <strong>{c.instance_url}</strong> — requires authentication. Connect a Mastodon account on this server to continue.
                                </p>
                            ) : (
                                <p className="text-muted-foreground text-sm">
                                    <strong>{c.instance_url}</strong>
                                </p>
                            )}
                            <Form {...disconnectAccount.form({ account: c.id })}>
                                {({ processing }) => (
                                    <Button type="submit" variant="destructive" size="sm" disabled={processing}>
                                        Remove
                                    </Button>
                                )}
                            </Form>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )}

    <div className="space-y-4">
        <div className="rounded-md border bg-muted/50 p-4">
            <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Add account</p>
            <Form {...mastodon.redirect.form()} className="space-y-3">
                {({ processing, errors }) => (
                    <>
                        <div className="space-y-1">
                            <Label htmlFor="instance_url">Instance URL</Label>
                            <InstanceCombobox id="instance_url" name="instance_url" placeholder="https://mastodon.social" />
                            <InputError message={errors.instance_url} />
                        </div>
                        <Button type="submit" disabled={processing}>Connect Mastodon</Button>
                    </>
                )}
            </Form>
        </div>
        <div className="rounded-md border bg-muted/50 p-4">
            <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Follow public timeline</p>
            <AddPublicMastodonForm />
        </div>
    </div>
</div>
```

- [ ] **Step 6: Update the Bluesky section to show feed accounts and add form**

Replace the Bluesky section:

```tsx
{/* Bluesky */}
<div className="rounded-lg border p-6">
    <h3 className="mb-4 flex items-center gap-2 font-semibold text-base">
        <SiBluesky className="size-4" /> Bluesky
    </h3>

    {blueskyConnections.filter(c => c.feed_type === 'home').length > 0 && (
        <div className="mb-4">
            <p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Connected accounts
            </p>
            <ul className="space-y-2">
                {blueskyConnections.filter(c => c.feed_type === 'home').map((c) => (
                    <li key={c.id} data-testid={`account-${c.id}`} className="rounded-md border px-3 py-2">
                        {c.auth_failed_at ? (
                            <BlueskyReauthForm connection={c} />
                        ) : (
                            <div>
                                <div className="flex items-center justify-between">
                                    <p className="text-muted-foreground text-sm"><strong>{c.handle}</strong></p>
                                    <Form {...disconnectAccount.form({ account: c.id })}>
                                        {({ processing }) => (
                                            <Button type="submit" variant="destructive" size="sm" disabled={processing}>
                                                Disconnect
                                            </Button>
                                        )}
                                    </Form>
                                </div>
                                <AccountFeedSettings connection={c} />

                                {blueskyConnections.filter(f => f.feed_type === 'bluesky_feed').length > 0 && (
                                    <div className="mt-3 border-t pt-3">
                                        <p className="mb-2 text-muted-foreground text-xs font-semibold uppercase tracking-wide">Feeds</p>
                                        <ul className="space-y-1">
                                            {blueskyConnections.filter(f => f.feed_type === 'bluesky_feed').map((f) => (
                                                <li key={f.id} className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground truncate max-w-xs">{f.feed_settings?.feed_uri ?? 'Unknown feed'}</span>
                                                    <Form {...disconnectAccount.form({ account: f.id })}>
                                                        {({ processing }) => (
                                                            <Button type="submit" variant="ghost" size="sm" disabled={processing}>
                                                                Remove
                                                            </Button>
                                                        )}
                                                    </Form>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )}

    <div className="space-y-4">
        <div className="rounded-md border bg-muted/50 p-4">
            <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Add account</p>
            <Form {...bluesky.store.form()} className="space-y-3">
                {({ processing, errors }) => (
                    <>
                        <div className="space-y-1">
                            <Label htmlFor="bsky_handle">Handle</Label>
                            <Input id="bsky_handle" name="handle" placeholder="alice.bsky.social" />
                            <InputError message={errors.handle} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="app_password">App Password</Label>
                            <Input id="app_password" name="app_password" type="password" placeholder="xxxx-xxxx-xxxx-xxxx" />
                            <InputError message={errors.app_password} />
                            <p className="text-muted-foreground text-xs">Generate one at Settings &rarr; Privacy and Security &rarr; App Passwords in Bluesky.</p>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="pds_url">PDS URL <span className="font-normal text-muted-foreground text-xs">(optional — leave blank for bsky.social)</span></Label>
                            <Input id="pds_url" name="pds_url" placeholder="https://bsky.social" />
                            <InputError message={errors.pds_url} />
                        </div>
                        <Button type="submit" disabled={processing}>Connect Bluesky</Button>
                    </>
                )}
            </Form>
        </div>
        {blueskyConnections.some(c => c.feed_type === 'home') && (
            <div className="rounded-md border bg-muted/50 p-4">
                <p className="mb-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Add algorithmic feed</p>
                <AddBlueskyFeedForm />
            </div>
        )}
    </div>
</div>
```

- [ ] **Step 7: Add status messages for new connection types**

In the `Connections` component's status block, add after the existing Bluesky status messages:

```tsx
{status === 'public-mastodon-added' && (
    <div className="font-medium text-green-600 text-sm">
        Public Mastodon timeline added.
    </div>
)}
{status === 'public-mastodon-already-added' && (
    <div className="font-medium text-amber-600 text-sm">
        That instance's public timeline is already in your feed.
    </div>
)}
{status === 'bluesky-feed-added' && (
    <div className="font-medium text-green-600 text-sm">
        Bluesky feed added.
    </div>
)}
```

- [ ] **Step 8: Update the filter for `mastodonConnections` and `blueskyConnections`**

The existing filter `c.provider === 'mastodon'` already works for all feed types since `provider` is `'mastodon'` for both `home` and `public_mastodon`. No change needed here — the sub-filtering by `feed_type` done in the render is sufficient.

- [ ] **Step 9: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 10: Commit**

```bash
git add resources/js/pages/settings/connections.tsx \
        routes/settings.php
git commit -m "🖼️ Add public Mastodon and Bluesky feed forms to connections page"
```

---

## Task 9: Close out — run full suite and push

- [ ] **Step 1: Run full test suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 3: Push the branch**

```bash
git push
```
