# Gravatar Profile Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Bloom account's sidebar profile icon use the user's Gravatar image, falling back to the existing initials placeholder when no Gravatar exists.

**Architecture:** Add an `avatar` accessor to `App\Models\User` that builds a Gravatar URL from a SHA256 hash of the user's lowercased/trimmed email (`s=128&d=404`), and append it to the model's serialized output so it flows through the existing `HandleInertiaRequests::share()` → `UserInfo` → `AvatarImage` path with no frontend changes.

**Tech Stack:** Laravel 13 (Eloquent attribute accessors), Pest 4.

**Spec:** `docs/superpowers/specs/2026-07-19-gravatar-profile-icon-design.md`

---

### Task 0: Create the per-ticket feature branch

**Files:** none.

- [ ] **Step 1: Branch off the milestone integration branch**

`release/milestone1.10` is the milestone's integration branch (tickets branch off it, PRs merge back into it). Create a feature branch for this ticket:

```bash
git checkout release/milestone1.10
git pull origin release/milestone1.10
git checkout -b feature/3-gravatar-profile-icon
```

- [ ] **Step 2: Confirm the branch**

```bash
git branch --show-current
```

Expected: `feature/3-gravatar-profile-icon`

---

### Task 1: Add the `avatar` accessor to `User`

**Files:**
- Modify: `app/Models/User.php`
- Test: `tests/Feature/Models/UserAvatarTest.php`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/Models/UserAvatarTest.php`:

```php
<?php

use App\Models\User;

test('avatar accessor builds a gravatar url from a sha256 hash of the lowercased trimmed email', function () {
    $user = User::factory()->create(['email' => '  Test@Example.com  ']);

    $expectedHash = hash('sha256', 'test@example.com');

    expect($user->avatar)->toBe("https://www.gravatar.com/avatar/{$expectedHash}?s=128&d=404");
});

test('avatar is appended to the serialized user output', function () {
    $user = User::factory()->create(['email' => 'test@example.com']);

    $expectedHash = hash('sha256', 'test@example.com');

    expect($user->toArray())->toHaveKey('avatar', "https://www.gravatar.com/avatar/{$expectedHash}?s=128&d=404");
});
```

Note: `email` is stored lowercased already (`User::email()` attribute setter lowercases it), but the test explicitly exercises trimming/lowercasing in the accessor itself rather than relying on the setter, since the accessor should be correct independent of that setter's behavior.

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact tests/Feature/Models/UserAvatarTest.php`
Expected: FAIL — `avatar` is `null`/undefined, both assertions fail.

- [ ] **Step 3: Implement the accessor**

In `app/Models/User.php`, add the `Attribute` import is already present (`use Illuminate\Database\Eloquent\Casts\Attribute;`). Add a new accessor method after the existing `email()` accessor (after line 40):

```php
    protected function avatar(): Attribute
    {
        return Attribute::make(
            get: fn () => 'https://www.gravatar.com/avatar/'.hash('sha256', strtolower(trim($this->email))).'?s=128&d=404',
        );
    }
```

Add `'avatar'` to the model's `$appends` array so it's included in serialization. The model currently has no `$appends` property — add one directly below the `$casts` property (after line 35):

```php
    protected $appends = ['avatar'];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact tests/Feature/Models/UserAvatarTest.php`
Expected: PASS (2 tests)

- [ ] **Step 5: Run Pint**

Run: `vendor/bin/pint --dirty --format agent`
Expected: no violations, or auto-fixed formatting only.

- [ ] **Step 6: Commit**

```bash
git add app/Models/User.php tests/Feature/Models/UserAvatarTest.php
git commit -m "🎇 Add Gravatar-derived avatar accessor to User model (#3)"
```

---

### Task 2: Verify the frontend renders it correctly (manual + existing test check)

**Files:** none modified — this task confirms the existing frontend code (already spec'd as needing no changes) actually works end-to-end with real data.

- [ ] **Step 1: Run the full backend test suite to confirm no regressions**

Run: `php artisan test --compact`
Expected: all tests pass, including the two new ones from Task 1.

- [ ] **Step 2: Confirm `UserInfo` already consumes `user.avatar` correctly**

Read `resources/js/components/user-info.tsx:15` — confirm `<AvatarImage src={user.avatar} alt={user.name} />` is unchanged and matches the `avatar` key now present in the `auth.user` Inertia prop. No edit needed; this step is a verification checkpoint, not a code change.

- [ ] **Step 3: Manually verify in the browser**

Start the dev server if not already running (`composer run dev` or ask the user if they have it running — per project convention, don't assume). Log in as a test user with a known email (e.g. one with a real Gravatar, such as an email registered on gravatar.com, or any email with no Gravatar to confirm the fallback).

Check:
- Sidebar profile icon shows the Gravatar image for an email that has one.
- Sidebar profile icon shows initials (existing fallback) for an email with no Gravatar (404 case).

Expected: both cases render correctly with no console errors.

- [ ] **Step 4: No commit needed**

This task is verification-only; nothing to commit.

---

### Task 3: Update the changelog

**Files:**
- Modify: `resources/docs/changelog.md`

- [ ] **Step 1: Add a changelog entry**

Per project convention (`resources/docs/changelog.md` — see `feedback_changelog_maintenance` memory: update this file whenever a user-facing change ships), add an entry. Check the top of the file first to see if a "Milestone 1.10" section already exists; if not, create one following the existing format (see the "Milestone 1.7" section for the pattern). Add:

```markdown
- **Gravatar profile icon** — your Bloom sidebar profile icon now uses your Gravatar image (based on your account email), falling back to your initials if you don't have one.
```

Also update the `last_updated` frontmatter date at the top of the file to today's date.

- [ ] **Step 2: Commit**

```bash
git add resources/docs/changelog.md
git commit -m "📖 Update changelog for Gravatar profile icon (#3)"
```

---

### Task 4: Open the pull request

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/3-gravatar-profile-icon
```

- [ ] **Step 2: Open a draft PR against the milestone branch**

```bash
gh pr create --draft --base release/milestone1.10 --title "Use Gravatar for profile icon (#3)" --body "$(cat <<'EOF'
## Summary
- Adds a Gravatar-derived `avatar` accessor to `User`, appended to serialized output so it flows through Inertia's shared `auth.user` prop with no frontend changes needed.
- Falls back to the existing initials placeholder (`AvatarFallback`) when no Gravatar exists for the account email, via Gravatar's `d=404` param + Radix Avatar's built-in load-error fallback.

Closes #3

## Test plan
- [x] `php artisan test --compact tests/Feature/Models/UserAvatarTest.php`
- [x] Full suite: `php artisan test --compact`
- [x] Manual check: sidebar icon shows Gravatar image when present, initials when absent

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Note: base branch is `release/milestone1.10`, not `main` — this ticket's changes merge into the milestone integration branch, which itself will be merged (or released) into `main` once the milestone ships.
