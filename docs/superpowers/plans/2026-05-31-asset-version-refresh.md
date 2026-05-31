# Asset Version Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force a full Inertia page reload whenever the deployed Vite build or APP_VERSION changes.

**Architecture:** Override `version()` in `HandleInertiaRequests` to return an MD5 of the Vite manifest hash plus `APP_VERSION`. Inertia compares this to the version header sent on every XHR navigation; a mismatch triggers an automatic full reload — no frontend changes needed.

**Tech Stack:** Laravel, Inertia.js, PestPHP

---

### Task 1: Implement and test version override

**Files:**
- Modify: `app/Http/Middleware/HandleInertiaRequests.php`
- Create: `tests/Feature/AssetVersionRefreshTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/AssetVersionRefreshTest.php`:

```php
<?php

use App\Models\User;

test('inertia returns 409 when version header is stale', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $this->get(route('dashboard'), [
        'X-Inertia' => 'true',
        'X-Inertia-Version' => 'stale-version-that-does-not-match',
    ])->assertStatus(409);
});

test('inertia does not return 409 when version header matches', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    // With no Vite manifest in test env, parent::version() returns null.
    // APP_VERSION is not set in tests, so config('version.version') is null.
    // The middleware returns md5('' . '') = md5('') = the known hash below.
    $currentVersion = md5('');

    $this->get(route('dashboard'), [
        'X-Inertia' => 'true',
        'X-Inertia-Version' => $currentVersion,
    ])->assertOk();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
./vendor/bin/pest tests/Feature/AssetVersionRefreshTest.php -v
```

Expected: both tests FAIL — the second one gets 200 OK (Inertia has no version to compare against with the default implementation), the first may also pass currently because parent returns null and null !== 'stale...' triggers a 409 already. Confirm the current state.

- [ ] **Step 3: Implement the version override**

In `app/Http/Middleware/HandleInertiaRequests.php`, replace:

```php
public function version(Request $request): ?string
{
    return parent::version($request);
}
```

with:

```php
public function version(Request $request): ?string
{
    return md5(parent::version($request) . config('version.version'));
}
```

The full updated method (no other changes to the file):

```php
public function version(Request $request): ?string
{
    return md5(parent::version($request) . config('version.version'));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
./vendor/bin/pest tests/Feature/AssetVersionRefreshTest.php -v
```

Expected:
```
PASS  Tests\Feature\AssetVersionRefreshTest
✓ inertia returns 409 when version header is stale
✓ inertia does not return 409 when version header matches
```

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
./vendor/bin/pest
```

Expected: all tests pass (same count as before, no new failures).

- [ ] **Step 6: Commit**

```bash
git checkout -b feature/asset-version-refresh
git add app/Http/Middleware/HandleInertiaRequests.php tests/Feature/AssetVersionRefreshTest.php
git commit -m "🎇 Force full reload on Vite build or APP_VERSION change"
```
