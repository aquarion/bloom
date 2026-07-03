# Multiple Social Accounts Per User — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to connect multiple social accounts per provider; fold in AT Protocol PDS URL support for Bluesky self-hosters; surface credential failures via `auth_failed_at`.

**Architecture:** A single migration drops the one-account-per-provider constraint and adds `auth_failed_at`. Controllers switch from `updateOrCreate` to duplicate-checked `create`. Destroy routes become resource-style (`/auth/bluesky/{account}`). Both feed services detect auth failures and stamp the account. The connections UI becomes a list-per-provider with an always-visible add form.

**Tech Stack:** Laravel 13, Pest, Inertia/React, TypeScript, Laravel Dusk, Wayfinder (typed route generation via Vite)

---

## File Map

| Action | File |
|---|---|
| Create | `database/migrations/2026_05_27_000000_update_social_accounts_for_multi_account.php` |
| Modify | `database/factories/SocialAccountFactory.php` |
| Modify | `app/Services/Bluesky/BlueskyAuthService.php` |
| Modify | `app/Services/Bluesky/BlueskyFeedService.php` |
| Modify | `app/Services/Mastodon/MastodonFeedService.php` |
| Modify | `app/Http/Controllers/Social/BlueskyController.php` |
| Modify | `app/Http/Controllers/Social/MastodonController.php` |
| Modify | `routes/settings.php` |
| Regenerated | `resources/js/actions/App/Http/Controllers/Social/BlueskyController.ts` |
| Regenerated | `resources/js/actions/App/Http/Controllers/Social/MastodonController.ts` |
| Modify | `resources/js/pages/settings/connections.tsx` |
| Modify | `tests/Feature/Social/BlueskyAuthTest.php` |
| Modify | `tests/Feature/Social/BlueskyControllerTest.php` |
| Modify | `tests/Feature/Social/BlueskyFeedServiceTest.php` |
| Create | `tests/Feature/Social/MastodonFeedServiceTest.php` |
| Modify | `tests/Feature/Social/MastodonControllerTest.php` |
| Create | `tests/Browser/ConnectionsTest.php` |

---

## Task 1: Migration and factory update

**Files:**
- Create: `database/migrations/2026_05_27_000000_update_social_accounts_for_multi_account.php`
- Modify: `database/factories/SocialAccountFactory.php`

- [ ] **Step 1: Create the migration**

```bash
php artisan make:migration update_social_accounts_for_multi_account
```

Then open the generated file and replace its contents:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Backfill instance_url for existing Bluesky rows before making it non-nullable
        DB::table('social_accounts')
            ->where('provider', 'bluesky')
            ->whereNull('instance_url')
            ->update(['instance_url' => 'https://bsky.social']);

        Schema::table('social_accounts', function (Blueprint $table) {
            // 2. Make instance_url non-nullable
            $table->string('instance_url')->nullable(false)->change();

            // 3. Drop the old one-account-per-provider constraint
            $table->dropUnique(['user_id', 'provider']);

            // 4. Add per-handle uniqueness constraint
            $table->unique(['user_id', 'provider', 'instance_url', 'handle']);

            // 5. Add auth failure timestamp
            $table->timestamp('auth_failed_at')->nullable()->after('handle');
        });
    }

    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'provider', 'instance_url', 'handle']);
            $table->dropColumn('auth_failed_at');
            $table->string('instance_url')->nullable()->change();
            $table->unique(['user_id', 'provider']);
        });
    }
};
```

- [ ] **Step 2: Run the migration**

```bash
php artisan migrate
```

Expected: migration runs without error. If it fails on the `dropUnique`, check the constraint name with `php artisan db:show --json | grep social_accounts`.

- [ ] **Step 3: Update SocialAccountFactory to always set instance_url**

The factory currently leaves `instance_url` null, which now violates the schema. Open `database/factories/SocialAccountFactory.php` and replace the `definition()` method:

```php
public function definition(): array
{
    $provider = fake()->randomElement(['mastodon', 'bluesky']);

    return [
        'user_id' => User::factory(),
        'provider' => $provider,
        'instance_url' => $provider === 'bluesky' ? 'https://bsky.social' : 'https://'.fake()->domainName(),
        'access_token' => fake()->sha256(),
        'token_secret' => null,
        'handle' => '@'.fake()->userName().'@'.($provider === 'bluesky' ? 'bsky.social' : fake()->domainName()),
        'auth_failed_at' => null,
    ];
}
```

- [ ] **Step 4: Run the full test suite to check nothing is broken yet**

```bash
./vendor/bin/pest
```

Expected: all existing tests pass. Any failure here is a factory or migration issue to fix before proceeding.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/ database/factories/SocialAccountFactory.php
git commit -m "⚙️ Migrate social_accounts: multi-account constraint + auth_failed_at"
```

---

## Task 2: BlueskyAuthService — add PDS URL parameter

**Files:**
- Modify: `app/Services/Bluesky/BlueskyAuthService.php`
- Modify: `tests/Feature/Social/BlueskyAuthTest.php`

- [ ] **Step 1: Write failing tests for pdsUrl parameter**

Open `tests/Feature/Social/BlueskyAuthTest.php` and add these two tests after the existing ones:

```php
it('creates a session using a custom PDS url', function () {
    Http::fake([
        'mypds.example.com/xrpc/com.atproto.server.createSession' => Http::response([
            'accessJwt' => 'access-jwt-token',
            'refreshJwt' => 'refresh-jwt-token',
            'handle' => 'alice.example.com',
            'did' => 'did:plc:abc123',
        ]),
    ]);

    $service = new BlueskyAuthService;
    $result = $service->createSession('alice.example.com', 'app-password-here', 'https://mypds.example.com');

    expect($result['handle'])->toBe('@alice.example.com');

    Http::assertSent(fn ($req) =>
        $req->url() === 'https://mypds.example.com/xrpc/com.atproto.server.createSession'
    );
});

it('refreshes a session using a custom PDS url', function () {
    Http::fake([
        'mypds.example.com/xrpc/com.atproto.server.refreshSession' => Http::response([
            'accessJwt' => 'new-access-jwt',
            'refreshJwt' => 'new-refresh-jwt',
        ]),
    ]);

    $service = new BlueskyAuthService;
    $result = $service->refreshSession('old-refresh-jwt', 'https://mypds.example.com');

    Http::assertSent(fn ($req) =>
        $req->url() === 'https://mypds.example.com/xrpc/com.atproto.server.refreshSession'
    );

    expect($result['access_token'])->toBe('new-access-jwt');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyAuthTest.php
```

Expected: the two new tests fail (wrong URL called).

- [ ] **Step 3: Update BlueskyAuthService**

Open `app/Services/Bluesky/BlueskyAuthService.php` and replace the full file:

```php
<?php

namespace App\Services\Bluesky;

use Illuminate\Support\Facades\Http;

class BlueskyAuthService
{
    private const DEFAULT_PDS = 'https://bsky.social';

    public function createSession(string $identifier, string $appPassword, string $pdsUrl = self::DEFAULT_PDS): array
    {
        $response = Http::post(rtrim($pdsUrl, '/').'/xrpc/com.atproto.server.createSession', [
            'identifier' => $identifier,
            'password' => $appPassword,
        ])->throw()->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
            'handle' => '@'.$response['handle'],
        ];
    }

    public function refreshSession(string $refreshToken, string $pdsUrl = self::DEFAULT_PDS): array
    {
        $response = Http::withToken($refreshToken)
            ->send('POST', rtrim($pdsUrl, '/').'/xrpc/com.atproto.server.refreshSession')
            ->throw()
            ->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
        ];
    }
}
```

- [ ] **Step 4: Run all Bluesky auth tests**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyAuthTest.php
```

Expected: all 5 tests pass (3 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Bluesky/BlueskyAuthService.php tests/Feature/Social/BlueskyAuthTest.php
git commit -m "🎇 BlueskyAuthService: accept custom PDS URL"
```

---

## Task 3: BlueskyFeedService — PDS URL passthrough and auth_failed_at

**Files:**
- Modify: `app/Services/Bluesky/BlueskyFeedService.php`
- Modify: `tests/Feature/Social/BlueskyFeedServiceTest.php`

- [ ] **Step 1: Write failing tests**

Open `tests/Feature/Social/BlueskyFeedServiceTest.php`. Add these tests after the existing ones (the file already uses `RefreshDatabase`):

```php
it('sets auth_failed_at when the refresh token is rejected', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'expired-token',
        'token_secret' => 'revoked-refresh-token',
        'auth_failed_at' => null,
    ]);

    Http::fake([
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::response(
            ['error' => 'ExpiredToken', 'message' => 'Token has expired'], 400
        ),
        'bsky.social/xrpc/com.atproto.server.refreshSession' => Http::response(
            ['error' => 'ExpiredToken', 'message' => 'Token has expired'], 400
        ),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);

    expect(fn () => $service->getHomeTimeline($account))
        ->toThrow(RequestException::class);

    expect($account->fresh()->auth_failed_at)->not->toBeNull();
});

it('clears auth_failed_at on successful token refresh', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'expired-token',
        'token_secret' => 'valid-refresh-token',
        'auth_failed_at' => now()->subHour(),
    ]);

    Http::fake([
        'bsky.social/xrpc/com.atproto.server.refreshSession' => Http::response([
            'accessJwt' => 'new-access-token',
            'refreshJwt' => 'new-refresh-token',
        ]),
        'bsky.social/xrpc/app.bsky.feed.getTimeline*' => Http::sequence()
            ->push(['error' => 'ExpiredToken', 'message' => 'Token has expired'], 400)
            ->push(['feed' => [['post' => ['uri' => 'at://did/app.bsky.feed.post/abc', 'record' => []]]], 'cursor' => null]),
    ]);

    $service = new BlueskyFeedService(new BlueskyAuthService);
    $service->getHomeTimeline($account);

    expect($account->fresh()->auth_failed_at)->toBeNull();
});
```

- [ ] **Step 2: Run to confirm they fail**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyFeedServiceTest.php --filter="auth_failed"
```

Expected: 2 failures.

- [ ] **Step 3: Update BlueskyFeedService**

Open `app/Services/Bluesky/BlueskyFeedService.php` and replace the `request()` method:

```php
private function request(SocialAccount $account, callable $call): array
{
    try {
        $result = $call($account->access_token);

        // Clear any previous auth failure on success
        if ($account->auth_failed_at !== null) {
            $account->update(['auth_failed_at' => null]);
        }

        return $result;
    } catch (RequestException $e) {
        if (($e->response->json('error') ?? '') !== 'ExpiredToken') {
            throw $e;
        }

        try {
            $tokens = $this->auth->refreshSession(
                $account->token_secret,
                $account->instance_url ?? 'https://bsky.social',
            );
        } catch (RequestException $refreshException) {
            // 4xx means credentials are gone (expired/revoked), not a transient error
            if ($refreshException->response->status() < 500) {
                $account->update(['auth_failed_at' => now()]);
            }
            throw $refreshException;
        }

        $account->update([
            'access_token' => $tokens['access_token'],
            'token_secret' => $tokens['refresh_token'],
            'auth_failed_at' => null,
        ]);

        return $call($tokens['access_token']);
    }
}
```

- [ ] **Step 4: Run all BlueskyFeedService tests**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyFeedServiceTest.php
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Bluesky/BlueskyFeedService.php tests/Feature/Social/BlueskyFeedServiceTest.php
git commit -m "🎇 BlueskyFeedService: pass PDS URL to refresh, track auth_failed_at"
```

---

## Task 4: MastodonFeedService — auth_failed_at on 401

**Files:**
- Create: `tests/Feature/Social/MastodonFeedServiceTest.php`
- Modify: `app/Services/Mastodon/MastodonFeedService.php`

- [ ] **Step 1: Create the test file**

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

beforeEach(function () {
    Cache::flush();
});

it('sets auth_failed_at when the timeline returns 401', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'access_token' => 'revoked-token',
        'auth_failed_at' => null,
    ]);

    Http::fake([
        'mastodon.social/api/v1/timelines/home*' => Http::response(
            ['error' => 'The access token is invalid'], 401
        ),
    ]);

    $service = new MastodonFeedService;

    expect(fn () => $service->getHomeTimeline($account))
        ->toThrow(\Illuminate\Http\Client\RequestException::class);

    expect($account->fresh()->auth_failed_at)->not->toBeNull();
});

it('does not set auth_failed_at on transient 5xx errors', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'access_token' => 'valid-token',
        'auth_failed_at' => null,
    ]);

    Http::fake([
        'mastodon.social/api/v1/timelines/home*' => Http::response(
            ['error' => 'Internal Server Error'], 503
        ),
    ]);

    $service = new MastodonFeedService;

    expect(fn () => $service->getHomeTimeline($account))
        ->toThrow(\Illuminate\Http\Client\RequestException::class);

    expect($account->fresh()->auth_failed_at)->toBeNull();
});

it('clears auth_failed_at on successful timeline fetch', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'access_token' => 'valid-token',
        'auth_failed_at' => now()->subHour(),
    ]);

    Http::fake([
        'mastodon.social/api/v1/timelines/home*' => Http::response([
            ['id' => '123', 'created_at' => now()->toISOString(), 'content' => 'Hello'],
        ]),
    ]);

    $service = new MastodonFeedService;
    $service->getHomeTimeline($account);

    expect($account->fresh()->auth_failed_at)->toBeNull();
});
```

- [ ] **Step 2: Run to confirm all 3 tests fail**

```bash
./vendor/bin/pest tests/Feature/Social/MastodonFeedServiceTest.php
```

Expected: 3 failures — `auth_failed_at` logic not implemented yet.

- [ ] **Step 3: Update MastodonFeedService::fetchTimeline()**

Open `app/Services/Mastodon/MastodonFeedService.php` and replace `fetchTimeline()`:

```php
private function fetchTimeline(SocialAccount $account, array $params): array
{
    $response = Http::timeout(15)->withToken($account->access_token)
        ->get("{$account->instance_url}/api/v1/timelines/home", $params);

    // 401 means token is revoked — mark the account as needing reconnect
    if ($response->status() === 401) {
        $account->update(['auth_failed_at' => now()]);
    }

    $response->throw(); // throws for any 4xx/5xx

    // Success — clear any previous auth failure flag
    if ($account->auth_failed_at !== null) {
        $account->update(['auth_failed_at' => null]);
    }

    return $response->json();
}
```

- [ ] **Step 4: Run all MastodonFeedService tests**

```bash
./vendor/bin/pest tests/Feature/Social/MastodonFeedServiceTest.php
```

Expected: all 3 tests pass.

- [ ] **Step 5: Run the full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Mastodon/MastodonFeedService.php tests/Feature/Social/MastodonFeedServiceTest.php
git commit -m "🎇 MastodonFeedService: track auth_failed_at on 401"
```

---

## Task 5: BlueskyController — multi-account and route-model-bound destroy

**Files:**
- Modify: `app/Http/Controllers/Social/BlueskyController.php`
- Modify: `routes/settings.php`
- Modify: `tests/Feature/Social/BlueskyControllerTest.php`

**Note:** After updating the route, run `npm run dev` (with Vite) or `npm run build` to regenerate the Wayfinder TypeScript type file at `resources/js/actions/App/Http/Controllers/Social/BlueskyController.ts`. This file is auto-generated — do not edit it manually.

- [ ] **Step 1: Update the route for Bluesky destroy**

Open `routes/settings.php`. Change:

```php
Route::delete('auth/bluesky', [BlueskyController::class, 'destroy'])->name('bluesky.destroy');
```

to:

```php
Route::delete('auth/bluesky/{account}', [BlueskyController::class, 'destroy'])->name('bluesky.destroy');
```

- [ ] **Step 2: Regenerate Wayfinder TypeScript types**

```bash
npm run build
```

Expected: `resources/js/actions/App/Http/Controllers/Social/BlueskyController.ts` now has a `destroy` function that accepts `{ account: string | { id: string | number } }` as its first argument.

- [ ] **Step 3: Rewrite the failing tests first**

Open `tests/Feature/Social/BlueskyControllerTest.php` and replace the entire file:

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('redirects guests away from bluesky connect', function () {
    $response = $this->post('/auth/bluesky', ['handle' => 'test.bsky.social', 'app_password' => 'xxxx-xxxx']);

    $response->assertRedirect('/login');
});

it('saves a new bluesky account and redirects on store', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')
        ->once()
        ->with('test.bsky.social', 'xxxx-xxxx', 'https://bsky.social')
        ->andReturn([
            'access_token' => 'access-jwt',
            'refresh_token' => 'refresh-jwt',
            'handle' => '@test.bsky.social',
        ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'test.bsky.social',
        'app_password' => 'xxxx-xxxx',
    ]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-connected');

    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'handle' => '@test.bsky.social',
        'instance_url' => 'https://bsky.social',
    ]);
});

it('saves a bluesky account with a custom PDS url', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')
        ->once()
        ->with('alice.example.com', 'xxxx-xxxx', 'https://mypds.example.com')
        ->andReturn([
            'access_token' => 'access-jwt',
            'refresh_token' => 'refresh-jwt',
            'handle' => '@alice.example.com',
        ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'alice.example.com',
        'app_password' => 'xxxx-xxxx',
        'pds_url' => 'https://mypds.example.com',
    ]);

    $this->assertDatabaseHas('social_accounts', [
        'provider' => 'bluesky',
        'instance_url' => 'https://mypds.example.com',
    ]);
});

it('allows connecting a second bluesky account with a different handle', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@first.bsky.social',
    ]);

    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')->andReturn([
        'access_token' => 'access-jwt',
        'refresh_token' => 'refresh-jwt',
        'handle' => '@second.bsky.social',
    ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'second.bsky.social',
        'app_password' => 'xxxx-xxxx',
    ]);

    $response->assertSessionHas('status', 'bluesky-connected');
    $this->assertDatabaseCount('social_accounts', 2);
});

it('redirects with bluesky-already-connected for a duplicate handle', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@test.bsky.social',
    ]);

    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')->andReturn([
        'access_token' => 'access-jwt',
        'refresh_token' => 'refresh-jwt',
        'handle' => '@test.bsky.social',
    ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'test.bsky.social',
        'app_password' => 'xxxx-xxxx',
    ]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-already-connected');
    $this->assertDatabaseCount('social_accounts', 1);
});

it('validates handle and app_password on store', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/auth/bluesky', []);

    $response->assertSessionHasErrors(['handle', 'app_password']);
});

it('disconnects a specific bluesky account by id', function () {
    $user = User::factory()->create();
    $first = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@first.bsky.social',
    ]);
    $second = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@second.bsky.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/bluesky/{$first->id}");

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-disconnected');
    $this->assertDatabaseMissing('social_accounts', ['id' => $first->id]);
    $this->assertDatabaseHas('social_accounts', ['id' => $second->id]);
});

it('returns 403 when attempting to disconnect another users bluesky account', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $othersAccount = SocialAccount::factory()->create([
        'user_id' => $other->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/bluesky/{$othersAccount->id}");

    $response->assertForbidden();
    $this->assertDatabaseHas('social_accounts', ['id' => $othersAccount->id]);
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyControllerTest.php
```

Expected: most tests fail (controller still uses old `updateOrCreate` and parameterless destroy route).

- [ ] **Step 5: Rewrite BlueskyController**

Open `app/Http/Controllers/Social/BlueskyController.php` and replace the full file:

```php
<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Bluesky\BlueskyAuthService;
use Illuminate\Http\Request;

class BlueskyController extends Controller
{
    public function __construct(private BlueskyAuthService $auth) {}

    public function store(Request $request)
    {
        $request->validate([
            'handle' => 'required|string',
            'app_password' => 'required|string',
            'pds_url' => 'nullable|url',
        ]);

        $pdsUrl = $request->input('pds_url') ?: 'https://bsky.social';

        $result = $this->auth->createSession(
            $request->input('handle'),
            $request->input('app_password'),
            $pdsUrl,
        );

        $exists = $request->user()->socialAccounts()
            ->where('provider', 'bluesky')
            ->where('instance_url', $pdsUrl)
            ->where('handle', $result['handle'])
            ->exists();

        if ($exists) {
            return redirect()->route('connections.edit')
                ->with('status', 'bluesky-already-connected');
        }

        $request->user()->socialAccounts()->create([
            'provider' => 'bluesky',
            'instance_url' => $pdsUrl,
            'access_token' => $result['access_token'],
            'token_secret' => $result['refresh_token'],
            'handle' => $result['handle'],
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-connected');
    }

    public function destroy(Request $request, SocialAccount $account)
    {
        abort_unless($account->user_id === $request->user()->id, 403);

        $account->delete();

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-disconnected');
    }
}
```

- [ ] **Step 6: Run the tests**

```bash
./vendor/bin/pest tests/Feature/Social/BlueskyControllerTest.php
```

Expected: all 8 tests pass.

- [ ] **Step 7: Run full suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add app/Http/Controllers/Social/BlueskyController.php \
        routes/settings.php \
        resources/js/actions/App/Http/Controllers/Social/BlueskyController.ts \
        tests/Feature/Social/BlueskyControllerTest.php
git commit -m "🎇 BlueskyController: multi-account, PDS URL, route-model-bound destroy"
```

---

## Task 6: MastodonController — multi-account and route-model-bound destroy

**Files:**
- Modify: `app/Http/Controllers/Social/MastodonController.php`
- Modify: `routes/settings.php`
- Modify: `tests/Feature/Social/MastodonControllerTest.php`

- [ ] **Step 1: Update the route for Mastodon destroy**

Open `routes/settings.php`. Change:

```php
Route::delete('auth/mastodon', [MastodonController::class, 'destroy'])->name('mastodon.destroy');
```

to:

```php
Route::delete('auth/mastodon/{account}', [MastodonController::class, 'destroy'])->name('mastodon.destroy');
```

Then regenerate Wayfinder:

```bash
npm run build
```

Expected: `resources/js/actions/App/Http/Controllers/Social/MastodonController.ts` now has `destroy` accepting `{ account: ... }`.

- [ ] **Step 2: Rewrite the Mastodon controller tests**

Open `tests/Feature/Social/MastodonControllerTest.php` and replace the full file:

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('redirects guests away from mastodon connect', function () {
    $response = $this->post('/auth/mastodon', ['instance_url' => 'https://fosstodon.org']);

    $response->assertRedirect('/login');
});

it('redirects to the mastodon oauth authorize url', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getAuthorizeUrl')
        ->once()
        ->andReturn('https://fosstodon.org/oauth/authorize?client_id=abc');
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->post('/auth/mastodon', ['instance_url' => 'https://fosstodon.org']);

    $response->assertRedirect('https://fosstodon.org/oauth/authorize?client_id=abc');
    $this->assertEquals('https://fosstodon.org', session('mastodon_instance'));
});

it('validates instance_url on redirect', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->post('/auth/mastodon', ['instance_url' => 'not-a-url']);

    $response->assertSessionHasErrors('instance_url');
});

it('saves a new mastodon account on callback', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')
        ->once()
        ->with('https://fosstodon.org')
        ->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')
        ->once()
        ->andReturn(['access_token' => 'tok', 'handle' => '@testuser@fosstodon.org']);
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://fosstodon.org', 'mastodon_oauth_state' => 'teststate'])
        ->get('/auth/mastodon/callback?code=authcode&state=teststate');

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'mastodon-connected');

    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'handle' => '@testuser@fosstodon.org',
        'instance_url' => 'https://fosstodon.org',
    ]);
});

it('allows connecting a second mastodon account on a different instance', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')->andReturn(['access_token' => 'tok', 'handle' => '@alice@mastodon.social']);
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://mastodon.social', 'mastodon_oauth_state' => 'state'])
        ->get('/auth/mastodon/callback?code=code&state=state');

    $response->assertSessionHas('status', 'mastodon-connected');
    $this->assertDatabaseCount('social_accounts', 2);
});

it('allows connecting accounts with the same handle on different instances', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')->andReturn(['access_token' => 'tok', 'handle' => '@alice@fosstodon.org']);
    $this->app->instance(MastodonOAuthService::class, $service);

    // Different instance, same handle — should succeed
    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://social.coop', 'mastodon_oauth_state' => 'state'])
        ->get('/auth/mastodon/callback?code=code&state=state');

    $response->assertSessionHas('status', 'mastodon-connected');
    $this->assertDatabaseCount('social_accounts', 2);
});

it('redirects with mastodon-already-connected for a duplicate instance and handle', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')->andReturn(['access_token' => 'tok', 'handle' => '@alice@fosstodon.org']);
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://fosstodon.org', 'mastodon_oauth_state' => 'state'])
        ->get('/auth/mastodon/callback?code=code&state=state');

    $response->assertSessionHas('status', 'mastodon-already-connected');
    $this->assertDatabaseCount('social_accounts', 1);
});

it('disconnects a specific mastodon account by id', function () {
    $user = User::factory()->create();
    $first = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@first@fosstodon.org',
    ]);
    $second = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'handle' => '@first@mastodon.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/mastodon/{$first->id}");

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'mastodon-disconnected');
    $this->assertDatabaseMissing('social_accounts', ['id' => $first->id]);
    $this->assertDatabaseHas('social_accounts', ['id' => $second->id]);
});

it('returns 403 when attempting to disconnect another users mastodon account', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $othersAccount = SocialAccount::factory()->create([
        'user_id' => $other->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/mastodon/{$othersAccount->id}");

    $response->assertForbidden();
    $this->assertDatabaseHas('social_accounts', ['id' => $othersAccount->id]);
});
```

- [ ] **Step 3: Run tests to confirm failures**

```bash
./vendor/bin/pest tests/Feature/Social/MastodonControllerTest.php
```

Expected: most tests fail.

- [ ] **Step 4: Rewrite MastodonController**

Open `app/Http/Controllers/Social/MastodonController.php` and replace the full file:

```php
<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class MastodonController extends Controller
{
    public function __construct(private MastodonOAuthService $oauth) {}

    public function redirect(Request $request)
    {
        $request->validate(['instance_url' => 'required|url']);

        $instance = rtrim($request->input('instance_url'), '/');

        $this->validateInstanceUrl($instance);

        $redirectUri = route('mastodon.callback');

        session(['mastodon_instance' => $instance]);

        return redirect($this->oauth->getAuthorizeUrl($instance, $redirectUri));
    }

    public function callback(Request $request)
    {
        $request->validate(['code' => 'required|string', 'state' => 'required|string']);

        $expectedState = session()->pull('mastodon_oauth_state');

        if (! $expectedState || ! hash_equals($expectedState, $request->input('state'))) {
            abort(422, 'Invalid OAuth state.');
        }

        $instance = session('mastodon_instance');
        $credentials = $this->oauth->getStoredCredentials($instance);

        $result = $this->oauth->exchangeCode(
            instance: $instance,
            code: $request->input('code'),
            clientId: $credentials['client_id'],
            clientSecret: $credentials['client_secret'],
            redirectUri: route('mastodon.callback'),
        );

        $exists = $request->user()->socialAccounts()
            ->where('provider', 'mastodon')
            ->where('instance_url', $instance)
            ->where('handle', $result['handle'])
            ->exists();

        if ($exists) {
            return redirect()->route('connections.edit')
                ->with('status', 'mastodon-already-connected');
        }

        $request->user()->socialAccounts()->create([
            'provider' => 'mastodon',
            'instance_url' => $instance,
            'access_token' => $result['access_token'],
            'handle' => $result['handle'],
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'mastodon-connected');
    }

    public function destroy(Request $request, SocialAccount $account)
    {
        abort_unless($account->user_id === $request->user()->id, 403);

        $account->delete();

        return redirect()->route('connections.edit')
            ->with('status', 'mastodon-disconnected');
    }

    private function validateInstanceUrl(string $url): void
    {
        $parsed = parse_url($url);

        if (! $parsed || ($parsed['scheme'] ?? '') !== 'https') {
            throw ValidationException::withMessages(['instance_url' => 'Instance URL must use HTTPS.']);
        }

        $host = $parsed['host'] ?? '';
        $ip = gethostbyname($host);

        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw ValidationException::withMessages(['instance_url' => 'Instance URL is not allowed.']);
        }
    }
}
```

- [ ] **Step 5: Run all tests**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/Social/MastodonController.php \
        routes/settings.php \
        resources/js/actions/App/Http/Controllers/Social/MastodonController.ts \
        tests/Feature/Social/MastodonControllerTest.php
git commit -m "🎇 MastodonController: multi-account, route-model-bound destroy"
```

---

## Task 7: Connections route — pass id and auth_failed_at to frontend

**Files:**
- Modify: `routes/settings.php`

- [ ] **Step 1: Update the connections route data**

Open `routes/settings.php`. Find the `connections.edit` route and update the `select()` call:

```php
Route::get('settings/connections', function (Request $request) {
    return Inertia::render('settings/connections', [
        'connections' => $request->user()->socialAccounts()
            ->select('id', 'provider', 'handle', 'instance_url', 'auth_failed_at')
            ->get(),
        'status' => $request->session()->get('status'),
    ]);
})->name('connections.edit');
```

- [ ] **Step 2: Run all tests**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add routes/settings.php
git commit -m "🔄️ Connections route: expose id and auth_failed_at to frontend"
```

---

## Task 8: Frontend — rewrite connections.tsx

**Files:**
- Modify: `resources/js/pages/settings/connections.tsx`

At this point the Wayfinder-generated destroy functions accept `{ account: string | { id: string | number } }` as their first argument (regenerated in Tasks 5 and 6).

- [ ] **Step 1: Rewrite connections.tsx**

Open `resources/js/pages/settings/connections.tsx` and replace the entire file:

```tsx
import { Form, Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import bluesky from '@/routes/bluesky';
import { edit } from '@/routes/connections';
import mastodon from '@/routes/mastodon';

interface SocialConnection {
    id: number;
    provider: 'mastodon' | 'bluesky';
    handle: string;
    instance_url: string;
    auth_failed_at: string | null;
}

export default function Connections({
    connections,
    status,
}: {
    connections: SocialConnection[];
    status?: string;
}) {
    const mastodonConnections = connections.filter((c) => c.provider === 'mastodon');
    const blueskyConnections = connections.filter((c) => c.provider === 'bluesky');

    return (
        <>
            <Head title="Connected accounts" />

            <h1 className="sr-only">Connected accounts</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Connected accounts"
                    description="Connect your Mastodon and Bluesky accounts to populate your feed."
                />

                {status === 'mastodon-connected' && (
                    <div className="text-sm font-medium text-green-600">Mastodon account connected.</div>
                )}
                {status === 'mastodon-disconnected' && (
                    <div className="text-sm font-medium text-green-600">Mastodon account disconnected.</div>
                )}
                {status === 'mastodon-already-connected' && (
                    <div className="text-sm font-medium text-amber-600">That Mastodon account is already connected.</div>
                )}
                {status === 'bluesky-connected' && (
                    <div className="text-sm font-medium text-green-600">Bluesky account connected.</div>
                )}
                {status === 'bluesky-disconnected' && (
                    <div className="text-sm font-medium text-green-600">Bluesky account disconnected.</div>
                )}
                {status === 'bluesky-already-connected' && (
                    <div className="text-sm font-medium text-amber-600">That Bluesky account is already connected.</div>
                )}

                {/* Mastodon */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 text-base font-semibold">Mastodon</h3>

                    {mastodonConnections.length > 0 && (
                        <ul className="mb-4 space-y-2">
                            {mastodonConnections.map((c) => (
                                <li key={c.id} className="flex items-center justify-between">
                                    {c.auth_failed_at ? (
                                        <p className="text-sm text-amber-600">
                                            <strong>{c.handle}</strong> — needs reconnecting (credentials expired)
                                        </p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            <strong>{c.handle}</strong>
                                            <span className="ml-1 text-xs">({c.instance_url})</span>
                                        </p>
                                    )}
                                    <Form {...mastodon.destroy.form({ account: c.id })}>
                                        {({ processing }) => (
                                            <Button
                                                type="submit"
                                                variant="destructive"
                                                size="sm"
                                                disabled={processing}
                                            >
                                                Disconnect
                                            </Button>
                                        )}
                                    </Form>
                                </li>
                            ))}
                        </ul>
                    )}

                    <form
                        action={mastodon.redirect.url()}
                        method="post"
                        className="space-y-4"
                    >
                        <input type="hidden" name="_token" value={document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content} />
                        <p className="text-sm font-medium text-muted-foreground">
                            {mastodonConnections.length > 0 ? 'Add another Mastodon account' : 'Connect a Mastodon account'}
                        </p>
                        <div className="space-y-1">
                            <Label htmlFor="instance_url">Instance URL</Label>
                            <Input
                                id="instance_url"
                                name="instance_url"
                                placeholder="https://mastodon.social"
                            />
                        </div>
                        <Button type="submit">Connect Mastodon</Button>
                    </form>
                </div>

                {/* Bluesky */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 text-base font-semibold">Bluesky</h3>

                    {blueskyConnections.length > 0 && (
                        <ul className="mb-4 space-y-2">
                            {blueskyConnections.map((c) => (
                                <li key={c.id} className="flex items-center justify-between">
                                    {c.auth_failed_at ? (
                                        <p className="text-sm text-amber-600">
                                            <strong>{c.handle}</strong> — needs reconnecting (credentials expired)
                                        </p>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            <strong>{c.handle}</strong>
                                        </p>
                                    )}
                                    <Form {...bluesky.destroy.form({ account: c.id })}>
                                        {({ processing }) => (
                                            <Button
                                                type="submit"
                                                variant="destructive"
                                                size="sm"
                                                disabled={processing}
                                            >
                                                Disconnect
                                            </Button>
                                        )}
                                    </Form>
                                </li>
                            ))}
                        </ul>
                    )}

                    <Form {...bluesky.store.form()} className="space-y-4">
                        {({ processing, errors }) => (
                            <>
                                <p className="text-sm font-medium text-muted-foreground">
                                    {blueskyConnections.length > 0 ? 'Add another Bluesky account' : 'Connect a Bluesky account'}
                                </p>
                                <div className="space-y-1">
                                    <Label htmlFor="bsky_handle">Handle</Label>
                                    <Input
                                        id="bsky_handle"
                                        name="handle"
                                        placeholder="alice.bsky.social"
                                    />
                                    <InputError message={errors.handle} />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="app_password">App Password</Label>
                                    <Input
                                        id="app_password"
                                        name="app_password"
                                        type="password"
                                        placeholder="xxxx-xxxx-xxxx-xxxx"
                                    />
                                    <InputError message={errors.app_password} />
                                    <p className="text-xs text-muted-foreground">
                                        Generate one at Settings &rarr; Privacy and Security &rarr; App Passwords in Bluesky.
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="pds_url">PDS URL <span className="text-xs font-normal text-muted-foreground">(optional — leave blank for bsky.social)</span></Label>
                                    <Input
                                        id="pds_url"
                                        name="pds_url"
                                        placeholder="https://bsky.social"
                                    />
                                    <InputError message={errors.pds_url} />
                                </div>
                                <Button type="submit" disabled={processing}>Connect Bluesky</Button>
                            </>
                        )}
                    </Form>
                </div>
            </div>
        </>
    );
}

Connections.layout = {
    breadcrumbs: [
        {
            title: 'Connected accounts',
            href: edit(),
        },
    ],
};
```

- [ ] **Step 2: Type-check the frontend**

```bash
npm run types:check
```

Expected: no TypeScript errors. If the `destroy.form({ account: c.id })` calls fail type-checking, verify that `npm run build` was run after the route changes in Tasks 5 and 6 — the Wayfinder types must be regenerated first.

- [ ] **Step 3: Run full test suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/settings/connections.tsx
git commit -m "🖼️ Connections page: list-per-provider, PDS URL field, auth failure warning"
```

---

## Task 9: Dusk browser tests

**Files:**
- Create: `tests/Browser/ConnectionsTest.php`

Dusk tests run against a real browser hitting a real server. They can't use `Http::fake()`, so they only cover display and disconnect flows — the actual connect/OAuth flows are covered by feature tests.

- [ ] **Step 1: Create the Dusk test file**

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use Laravel\Dusk\Browser;

test('connections page loads with provider sections', function () {
    $user = User::factory()->create();

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertPathIs('/settings/connections')
            ->assertSee('Mastodon')
            ->assertSee('Bluesky');
    });
});

test('connected mastodon account is displayed with disconnect button', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice@fosstodon.org')
            ->assertSee('Disconnect');
    });
});

test('connected bluesky account is displayed with disconnect button', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@alice.bsky.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice.bsky.social')
            ->assertSee('Disconnect');
    });
});

test('multiple mastodon accounts all appear', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'handle' => '@alice@mastodon.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice@fosstodon.org')
            ->assertSee('@alice@mastodon.social');
    });
});

test('multiple bluesky accounts all appear', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@alice.bsky.social',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@work.bsky.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice.bsky.social')
            ->assertSee('@work.bsky.social');
    });
});

test('disconnecting a mastodon account removes it and leaves others', function () {
    $user = User::factory()->create();
    $keep = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@keep@fosstodon.org',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'handle' => '@remove@mastodon.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user, $keep) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@remove@mastodon.social');

        // Click the Disconnect button next to the account we want to remove.
        // Each disconnect button submits a form — click the one inside the list item for @remove.
        $browser->within('li:has(strong:contains("@remove@mastodon.social"))', function (Browser $li) {
            $li->press('Disconnect');
        });

        $browser->waitForLocation('/settings/connections')
            ->assertDontSee('@remove@mastodon.social')
            ->assertSee('@keep@fosstodon.org');
    });
});

test('disconnecting a bluesky account removes it and leaves others', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@keep.bsky.social',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@remove.bsky.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@remove.bsky.social');

        $browser->within('li:has(strong:contains("@remove.bsky.social"))', function (Browser $li) {
            $li->press('Disconnect');
        });

        $browser->waitForLocation('/settings/connections')
            ->assertDontSee('@remove.bsky.social')
            ->assertSee('@keep.bsky.social');
    });
});

test('account with auth_failed_at shows reconnect warning', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@stale.bsky.social',
        'auth_failed_at' => now()->subDay(),
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@stale.bsky.social')
            ->assertSee('needs reconnecting');
    });
});
```

- [ ] **Step 2: Run the Dusk tests**

```bash
php artisan dusk tests/Browser/ConnectionsTest.php
```

Expected: all 8 tests pass. If a test fails on the `within('li:has(...)`)` selector, check that the browser supports `:has()` pseudo-class (Chrome 105+) — Dusk uses Chrome, so this should be fine.

- [ ] **Step 3: Run the full test suite including Dusk**

```bash
./vendor/bin/pest && php artisan dusk
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/Browser/ConnectionsTest.php
git commit -m "🪳 Dusk: connections page display and disconnect tests"
```

---

## Final verification

- [ ] Run `./vendor/bin/pest` — all feature/unit tests pass
- [ ] Run `php artisan dusk` — all browser tests pass
- [ ] Run `npm run types:check` — no TypeScript errors
- [ ] Verify the `social_accounts` table structure in production-equivalent DB: `php artisan db:show --json`
