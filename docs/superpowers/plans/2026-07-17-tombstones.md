# Tombstones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement account-inactivity lifecycle management — warn at 83 days, archive ("tombstone") at 90 days, and let a returning owner delete or resurrect their tombstoned account.

**Architecture:** Two new nullable timestamp columns on `users` drive two daily scheduled commands. Tombstoning moves a user's identity, passkeys, and social-account metadata (no tokens) into a `tombstones` row, then deletes the `User` row (cascade cleans up everything else). The passkey-login and passkey-recovery paths gain a fallback lookup into `tombstones` so a returning owner lands on an interstitial (`/account/archived`) instead of a dead end, with identical failure responses to a normal bad attempt (no enumeration leak).

**Tech Stack:** Laravel 13, Eloquent, Laravel Scheduler (`Schedule::command()->daily()`), Inertia v3 + React 19, Pest 4.

**Full design reference:** `docs/superpowers/specs/2026-07-13-tombstones-design.md`

---

## File Structure

- `config/inactivity.php` — new. Threshold config.
- `database/migrations/2026_07_17_000001_add_activity_tracking_to_users_table.php` — new.
- `database/migrations/2026_07_17_000002_create_tombstones_table.php` — new.
- `database/migrations/2026_07_17_000003_create_tombstone_recovery_tokens_table.php` — new.
- `app/Models/User.php` — modify. `last_active_at`/`inactivity_warning_sent_at` fillable + casts, `cancelSubscription()`, `isSubscribed()`.
- `app/Models/SocialAccount.php` — modify. `toArchive()`, `rehydrate()`.
- `app/Models/Tombstone.php` — new.
- `app/Models/TombstoneRecoveryToken.php` — new.
- `database/factories/TombstoneFactory.php` — new.
- `app/Mail/InactivityWarning.php` + `resources/views/mail/inactivity-warning.blade.php` — new.
- `app/Mail/AccountTombstoned.php` + `resources/views/mail/account-tombstoned.blade.php` — new.
- `app/Mail/TombstoneRecovery.php` + `resources/views/mail/tombstone-recovery.blade.php` — new (recovery-path email; distinct copy from the live-user recovery email).
- `app/Console/Commands/WarnInactiveAccounts.php` — new (`accounts:warn-inactive`).
- `app/Console/Commands/TombstoneInactiveAccounts.php` — new (`accounts:tombstone-inactive`).
- `routes/console.php` — modify. Schedule both commands.
- `app/Http/Controllers/Auth/PasskeyAuthController.php` — modify. Tombstone fallback on failed live lookup; stamp `last_active_at` on login.
- `app/Http/Controllers/Settings/PasskeyController.php` — modify. Stamp `last_active_at` on passkey registration.
- `app/Http/Controllers/Auth/PasskeyRecoveryController.php` — modify. Tombstone email lookup; `setup()` token-type branching.
- `app/Http/Controllers/Auth/TombstoneController.php` — new. `show()`/`destroy()`/`resurrect()`.
- `routes/web.php` — modify. `tombstone.*` routes (guest-accessible).
- `resources/js/pages/auth/tombstone.tsx` — new.
- Test files under `tests/Feature/` and `tests/Unit/` per task below.

---

### Task 1: `config/inactivity.php`

**Files:**
- Create: `config/inactivity.php`

- [ ] **Step 1: Write the config file**

```php
<?php

return [
    'warning_after_days' => env('INACTIVITY_WARNING_DAYS', 83),
    'tombstone_after_days' => env('INACTIVITY_TOMBSTONE_DAYS', 90),
];
```

- [ ] **Step 2: Verify it loads**

Run: `php artisan config:show inactivity`
Expected: shows `warning_after_days => 83` and `tombstone_after_days => 90`.

- [ ] **Step 3: Commit**

```bash
git add config/inactivity.php
git commit -m "🎇 Add inactivity threshold config"
```

---

### Task 2: Activity-tracking columns on `users`

**Files:**
- Create: `database/migrations/2026_07_17_000001_add_activity_tracking_to_users_table.php`
- Modify: `app/Models/User.php`
- Test: `tests/Unit/Models/UserActivityTrackingTest.php`

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('users', 'last_active_at')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_active_at')->nullable()->after('email');
            $table->timestamp('inactivity_warning_sent_at')->nullable()->after('last_active_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['last_active_at', 'inactivity_warning_sent_at']);
        });
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `php artisan migrate`
Expected: `add_activity_tracking_to_users_table` migrated successfully.

- [ ] **Step 3: Write the failing test**

```php
<?php

use App\Models\User;

uses(Tests\TestCase::class);

test('last_active_at and inactivity_warning_sent_at are datetime casts and mass-assignable', function () {
    $user = User::factory()->create([
        'last_active_at' => now()->subDays(5),
        'inactivity_warning_sent_at' => now()->subDay(),
    ]);

    expect($user->last_active_at)->toBeInstanceOf(\Illuminate\Support\Carbon::class);
    expect($user->inactivity_warning_sent_at)->toBeInstanceOf(\Illuminate\Support\Carbon::class);

    $user->update(['last_active_at' => now(), 'inactivity_warning_sent_at' => null]);

    expect($user->fresh()->inactivity_warning_sent_at)->toBeNull();
});
```

Place this in `tests/Feature/Models/UserActivityTrackingTest.php` (Feature, not Unit — it needs `RefreshDatabase`, which Pest applies automatically to `tests/Feature/**`, per `tests/Pest.php`).

- [ ] **Step 4: Run test to verify it fails**

Run: `php artisan test --compact --filter="last_active_at and inactivity_warning_sent_at"`
Expected: FAIL — mass assignment exception, `last_active_at` not fillable, or cast missing (raw string instead of Carbon).

- [ ] **Step 5: Update `User` model**

In `app/Models/User.php`, change the class attribute and add a `casts()` method:

```php
#[Fillable(['name', 'email', 'feed_preferences', 'last_active_at', 'inactivity_warning_sent_at'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasJsonPreferences, HasRoles, Notifiable;

    protected string $preferencesColumn = 'feed_preferences';

    protected array $preferencesDefaults = [
        'mute_words' => [],
        'max_age_days' => 7,
        'cw_behavior' => 'blur',
        'sensitive_media_behavior' => 'blur',
    ];

    protected $casts = [
        'feed_preferences' => 'array',
        'roles' => 'array',
        'last_active_at' => 'datetime',
        'inactivity_warning_sent_at' => 'datetime',
    ];
```

(Keep the rest of the file — `email()` accessor, `socialAccounts()`, `passkeys()` — unchanged.)

- [ ] **Step 6: Run test to verify it passes**

Run: `php artisan test --compact --filter="last_active_at and inactivity_warning_sent_at"`
Expected: PASS

- [ ] **Step 7: Add `cancelSubscription()` / `isSubscribed()` placeholders — write the failing test first**

Add to the same test file:

```php
test('cancelSubscription and isSubscribed are no-op billing placeholders', function () {
    $user = User::factory()->create();

    expect($user->isSubscribed())->toBeFalse();
    expect($user->cancelSubscription())->toBeNull();
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `php artisan test --compact --filter="cancelSubscription and isSubscribed"`
Expected: FAIL — methods don't exist.

- [ ] **Step 9: Add the methods to `User`**

```php
    /**
     * Cancel any active subscription for this user.
     *
     * No-op today — this application has no billing/subscription system yet.
     * Wired in ahead of time so account-tombstoning has a real hook to call
     * once billing exists, without needing to touch the tombstoning command.
     */
    public function cancelSubscription(): void
    {
        //
    }

    /**
     * Whether this user currently has a paid subscription.
     *
     * No-op today; see cancelSubscription().
     */
    public function isSubscribed(): bool
    {
        return false;
    }
```

- [ ] **Step 10: Run test to verify it passes**

Run: `php artisan test --compact --filter="cancelSubscription and isSubscribed"`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add database/migrations/2026_07_17_000001_add_activity_tracking_to_users_table.php app/Models/User.php tests/Feature/Models/UserActivityTrackingTest.php
git commit -m "🎇 Track user activity and add billing placeholder hooks"
```

---

### Task 3: `SocialAccount::toArchive()` / `::rehydrate()`

**Files:**
- Modify: `app/Models/SocialAccount.php`
- Test: `tests/Unit/Models/SocialAccountArchiveTest.php`

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\SocialAccount;

uses(Tests\TestCase::class);

test('toArchive returns metadata only, no tokens', function () {
    $account = SocialAccount::factory()->make([
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@nick@fosstodon.org',
        'access_token' => 'super-secret-token',
        'token_secret' => 'super-secret-secret',
    ]);

    $archive = $account->toArchive();

    expect($archive)->toBe([
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@nick@fosstodon.org',
    ]);
    expect($archive)->not->toHaveKey('access_token');
    expect($archive)->not->toHaveKey('token_secret');
});

test('rehydrate builds fillable attributes flagged for reconnect, with no token', function () {
    $archived = [
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'handle' => '@nick.bsky.social',
    ];

    $attributes = SocialAccount::rehydrate($archived, schemaVersion: 1);

    expect($attributes['provider'])->toBe('bluesky');
    expect($attributes['feed_type'])->toBe('home');
    expect($attributes['instance_url'])->toBe('https://bsky.social');
    expect($attributes['handle'])->toBe('@nick.bsky.social');
    expect($attributes)->not->toHaveKey('access_token');
    expect($attributes['auth_failed_at'])->not->toBeNull();
});

test('rehydrate throws on an unrecognised schema version rather than guessing', function () {
    SocialAccount::rehydrate(['provider' => 'mastodon'], schemaVersion: 999);
})->throws(RuntimeException::class);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=SocialAccountArchiveTest`
Expected: FAIL — `toArchive`/`rehydrate` undefined.

- [ ] **Step 3: Implement on `SocialAccount`**

Add to `app/Models/SocialAccount.php` (inside the class, after `user()`):

```php
    /** @return array{provider: string, feed_type: string, instance_url: ?string, handle: ?string} */
    public function toArchive(): array
    {
        return [
            'provider' => $this->provider,
            'feed_type' => $this->feed_type,
            'instance_url' => $this->instance_url,
            'handle' => $this->handle,
        ];
    }

    /**
     * Build fillable attributes for a fresh SocialAccount::create() call from an
     * archived Tombstone entry. Never restores a token — resurrected accounts
     * always reauth, per the tombstones design. Switches on the owning
     * Tombstone's schema_version so a shape this code doesn't recognise fails
     * loudly instead of being silently misread.
     *
     * @param  array<string, mixed>  $archived
     * @return array<string, mixed>
     */
    public static function rehydrate(array $archived, int $schemaVersion): array
    {
        if ($schemaVersion !== \App\Models\Tombstone::CURRENT_SCHEMA_VERSION) {
            throw new \RuntimeException("Unrecognised social-account archive schema version: {$schemaVersion}");
        }

        return [
            'provider' => $archived['provider'],
            'feed_type' => $archived['feed_type'],
            'instance_url' => $archived['instance_url'],
            'handle' => $archived['handle'],
            'auth_failed_at' => now(),
        ];
    }
```

Note: `Tombstone` doesn't exist yet — this task depends on Task 4 for `Tombstone::CURRENT_SCHEMA_VERSION` to resolve. Do Task 4 first if working strictly in file-dependency order, or stub the constant temporarily. **This plan lists tasks in the order they should be executed — do Task 4 before Task 3** if executing literally top-to-bottom would break autoloading. (Subagent-driven execution: run Task 4 before Task 3.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact --filter=SocialAccountArchiveTest`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/Models/SocialAccount.php tests/Unit/Models/SocialAccountArchiveTest.php
git commit -m "🎇 Add SocialAccount archive/rehydrate for tombstoning"
```

---

### Task 4: `tombstones` table + `Tombstone` model

**Files:**
- Create: `database/migrations/2026_07_17_000002_create_tombstones_table.php`
- Create: `app/Models/Tombstone.php`
- Create: `database/factories/TombstoneFactory.php`
- Test: `tests/Unit/Models/TombstoneTest.php`

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tombstones', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->string('name');
            $table->unsignedInteger('schema_version')->default(1);
            $table->json('archived_passkeys');
            $table->json('archived_social_accounts');
            $table->unsignedBigInteger('original_user_id')->nullable();
            $table->timestamp('tombstoned_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tombstones');
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `php artisan migrate`
Expected: `create_tombstones_table` migrated successfully.

- [ ] **Step 3: Write the failing test**

```php
<?php

use App\Models\Tombstone;

uses(Tests\TestCase::class);

test('archived_passkeys and archived_social_accounts cast to arrays, tombstoned_at casts to datetime', function () {
    $tombstone = Tombstone::factory()->create([
        'archived_passkeys' => [['credential_id' => 'abc123']],
        'archived_social_accounts' => [['provider' => 'mastodon']],
    ]);

    expect($tombstone->archived_passkeys)->toBe([['credential_id' => 'abc123']]);
    expect($tombstone->archived_social_accounts)->toBe([['provider' => 'mastodon']]);
    expect($tombstone->tombstoned_at)->toBeInstanceOf(\Illuminate\Support\Carbon::class);
});

test('CURRENT_SCHEMA_VERSION is 1', function () {
    expect(Tombstone::CURRENT_SCHEMA_VERSION)->toBe(1);
});
```

Place in `tests/Feature/Models/TombstoneTest.php` (needs `RefreshDatabase`).

- [ ] **Step 4: Run test to verify it fails**

Run: `php artisan test --compact --filter=TombstoneTest`
Expected: FAIL — `Tombstone` class doesn't exist.

- [ ] **Step 5: Create the model**

```php
<?php

namespace App\Models;

use Database\Factories\TombstoneFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tombstone extends Model
{
    /** @use HasFactory<TombstoneFactory> */
    use HasFactory;

    /**
     * Tags the shape of archived_passkeys/archived_social_accounts at write
     * time. Bump this whenever that shape changes, and switch on it in any
     * code that reads the JSON back (rehydrate(), the passkey-login fallback).
     */
    public const CURRENT_SCHEMA_VERSION = 1;

    protected $fillable = [
        'email',
        'name',
        'schema_version',
        'archived_passkeys',
        'archived_social_accounts',
        'original_user_id',
        'tombstoned_at',
    ];

    protected function casts(): array
    {
        return [
            'schema_version' => 'integer',
            'archived_passkeys' => 'array',
            'archived_social_accounts' => 'array',
            'tombstoned_at' => 'datetime',
        ];
    }

    /** @return HasMany<TombstoneRecoveryToken, $this> */
    public function recoveryTokens(): HasMany
    {
        return $this->hasMany(TombstoneRecoveryToken::class);
    }
}
```

- [ ] **Step 6: Create the factory**

```php
<?php

namespace Database\Factories;

use App\Models\Tombstone;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Tombstone>
 */
class TombstoneFactory extends Factory
{
    protected $model = Tombstone::class;

    public function definition(): array
    {
        return [
            'email' => fake()->unique()->safeEmail(),
            'name' => fake()->name(),
            'schema_version' => Tombstone::CURRENT_SCHEMA_VERSION,
            'archived_passkeys' => [],
            'archived_social_accounts' => [],
            'original_user_id' => null,
            'tombstoned_at' => now(),
        ];
    }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `php artisan test --compact --filter=TombstoneTest`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add database/migrations/2026_07_17_000002_create_tombstones_table.php app/Models/Tombstone.php database/factories/TombstoneFactory.php tests/Feature/Models/TombstoneTest.php
git commit -m "🎇 Add Tombstone model and table"
```

---

### Task 5: `tombstone_recovery_tokens` table + model

**Files:**
- Create: `database/migrations/2026_07_17_000003_create_tombstone_recovery_tokens_table.php`
- Create: `app/Models/TombstoneRecoveryToken.php`
- Test: `tests/Feature/Models/TombstoneRecoveryTokenTest.php`

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tombstone_recovery_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tombstone_id')->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('used_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tombstone_recovery_tokens');
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `php artisan migrate`
Expected: migrated successfully.

- [ ] **Step 3: Write the failing test**

```php
<?php

use App\Models\Tombstone;
use App\Models\TombstoneRecoveryToken;

test('createForTombstone hashes the token and consume() stamps used_at', function () {
    $tombstone = Tombstone::factory()->create();

    $record = TombstoneRecoveryToken::createForTombstone($tombstone, 'raw-token-value');

    expect($record->token)->toBe(hash('sha256', 'raw-token-value'));
    expect($record->used_at)->toBeNull();

    $record->consume();

    expect($record->fresh()->used_at)->not->toBeNull();
});

test('deleting a tombstone cascades to its recovery tokens', function () {
    $tombstone = Tombstone::factory()->create();
    $record = TombstoneRecoveryToken::createForTombstone($tombstone, 'raw-token-value');

    $tombstone->delete();

    expect(TombstoneRecoveryToken::find($record->id))->toBeNull();
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `php artisan test --compact --filter=TombstoneRecoveryTokenTest`
Expected: FAIL — `TombstoneRecoveryToken` doesn't exist.

- [ ] **Step 5: Create the model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TombstoneRecoveryToken extends Model
{
    protected $fillable = ['tombstone_id'];

    protected function casts(): array
    {
        return ['used_at' => 'datetime'];
    }

    public static function createForTombstone(Tombstone $tombstone, string $rawToken): self
    {
        $record = new self;
        $record->tombstone_id = $tombstone->id;
        $record->token = hash('sha256', $rawToken);
        $record->save();

        return $record;
    }

    public function consume(): void
    {
        $this->used_at = now();
        $this->save();
    }

    /** @return BelongsTo<Tombstone, $this> */
    public function tombstone(): BelongsTo
    {
        return $this->belongsTo(Tombstone::class);
    }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `php artisan test --compact --filter=TombstoneRecoveryTokenTest`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_07_17_000003_create_tombstone_recovery_tokens_table.php app/Models/TombstoneRecoveryToken.php tests/Feature/Models/TombstoneRecoveryTokenTest.php
git commit -m "🎇 Add TombstoneRecoveryToken model and table"
```

---

### Task 6: Mail — `InactivityWarning`, `AccountTombstoned`, `TombstoneRecovery`

**Files:**
- Create: `app/Mail/InactivityWarning.php`, `resources/views/mail/inactivity-warning.blade.php`
- Create: `app/Mail/AccountTombstoned.php`, `resources/views/mail/account-tombstoned.blade.php`
- Create: `app/Mail/TombstoneRecovery.php`, `resources/views/mail/tombstone-recovery.blade.php`
- Test: `tests/Feature/Mail/InactivityWarningTest.php`, `tests/Feature/Mail/AccountTombstonedTest.php`, `tests/Feature/Mail/TombstoneRecoveryTest.php`

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Mail/InactivityWarningTest.php`:

```php
<?php

use App\Mail\InactivityWarning;
use App\Models\User;

test('mailable has the expected subject and renders the user name', function () {
    $user = new User(['name' => 'Ada Lovelace', 'email' => 'ada@example.com']);

    $mailable = new InactivityWarning($user);

    expect($mailable->envelope()->subject)->toBe('Your account will be archived soon due to inactivity');
    expect($mailable->render())->toContain('Ada Lovelace');
});
```

`tests/Feature/Mail/AccountTombstonedTest.php`:

```php
<?php

use App\Mail\AccountTombstoned;

test('mailable has the expected subject and renders the name', function () {
    $mailable = new AccountTombstoned('Ada Lovelace');

    expect($mailable->envelope()->subject)->toBe('Your account has been archived due to inactivity');
    expect($mailable->render())->toContain('Ada Lovelace');
});
```

`tests/Feature/Mail/TombstoneRecoveryTest.php`:

```php
<?php

use App\Mail\TombstoneRecovery;
use App\Models\Tombstone;

test('mailable has the expected subject and renders the recovery url', function () {
    $tombstone = Tombstone::factory()->make(['name' => 'Ada Lovelace']);

    $mailable = new TombstoneRecovery($tombstone, 'https://bloom.test/recover/abc123');

    expect($mailable->envelope()->subject)->toBe('Your account was archived');
    expect($mailable->render())->toContain('https://bloom.test/recover/abc123');
    expect($mailable->render())->toContain('Ada Lovelace');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter="InactivityWarningTest|AccountTombstonedTest|TombstoneRecoveryTest"`
Expected: FAIL — classes don't exist.

- [ ] **Step 3: Create `app/Mail/InactivityWarning.php`**

```php
<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class InactivityWarning extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly User $user) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your account will be archived soon due to inactivity',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.inactivity-warning',
        );
    }
}
```

- [ ] **Step 4: Create `resources/views/mail/inactivity-warning.blade.php`**

```blade
<x-mail::message>
# Your account is going quiet

Hi {{ $user->name }},

We haven't seen you sign in for a while. If you don't sign in again soon, your account will be archived and your connected feeds disconnected.

Just sign in with your passkey any time to keep your account active — no other action is needed.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
```

- [ ] **Step 5: Create `app/Mail/AccountTombstoned.php`**

```php
<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AccountTombstoned extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly string $name) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your account has been archived due to inactivity',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.account-tombstoned',
        );
    }
}
```

- [ ] **Step 6: Create `resources/views/mail/account-tombstoned.blade.php`**

```blade
<x-mail::message>
# Your account has been archived

Hi {{ $name }},

Because your account was inactive for a while, it has now been archived. Your passkeys and connected accounts have been safely stored, and any subscription has been cancelled.

If you'd like your account back, just try signing in again — we'll walk you through recovering or deleting it.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
```

- [ ] **Step 7: Create `app/Mail/TombstoneRecovery.php`**

```php
<?php

namespace App\Mail;

use App\Models\Tombstone;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class TombstoneRecovery extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Tombstone $tombstone,
        public readonly string $recoveryUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your account was archived',
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.tombstone-recovery',
        );
    }
}
```

- [ ] **Step 8: Create `resources/views/mail/tombstone-recovery.blade.php`**

```blade
<x-mail::message>
# Your account was archived

Hi {{ $tombstone->name }},

Your account was archived due to inactivity. If you'd like it back, click below — you'll be able to choose whether to bring it back as a fresh account or delete it for good.

<x-mail::button :url="$recoveryUrl">
Continue
</x-mail::button>

This link expires in **1 hour** and can only be used once.

If you did not request this, you can safely ignore this email.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `php artisan test --compact --filter="InactivityWarningTest|AccountTombstonedTest|TombstoneRecoveryTest"`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add app/Mail/InactivityWarning.php app/Mail/AccountTombstoned.php app/Mail/TombstoneRecovery.php resources/views/mail/inactivity-warning.blade.php resources/views/mail/account-tombstoned.blade.php resources/views/mail/tombstone-recovery.blade.php tests/Feature/Mail/InactivityWarningTest.php tests/Feature/Mail/AccountTombstonedTest.php tests/Feature/Mail/TombstoneRecoveryTest.php
git commit -m "🎇 Add tombstoning mailables"
```

---

### Task 7: `accounts:warn-inactive` command

**Files:**
- Create: `app/Console/Commands/WarnInactiveAccounts.php`
- Modify: `routes/console.php`
- Test: `tests/Feature/Console/WarnInactiveAccountsTest.php`

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Mail\InactivityWarning;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

test('sends a warning to a user inside the warning window and stamps inactivity_warning_sent_at', function () {
    Mail::fake();

    $user = User::factory()->create([
        'last_active_at' => now()->subDays(85),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive')->assertExitCode(0);

    Mail::assertSent(InactivityWarning::class, fn ($mail) => $mail->hasTo($user->email));
    expect($user->fresh()->inactivity_warning_sent_at)->not->toBeNull();
});

test('does not resend once inactivity_warning_sent_at is already set', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => now()->subDays(85),
        'inactivity_warning_sent_at' => now()->subDay(),
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});

test('does not warn a user who is still within the active window', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => now()->subDays(10),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});

test('does not warn a user already past the tombstone threshold', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => now()->subDays(95),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});

test('warns exactly at the 83-day boundary', function () {
    Mail::fake();

    $user = User::factory()->create([
        'last_active_at' => now()->subDays(83),
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertSent(InactivityWarning::class, fn ($mail) => $mail->hasTo($user->email));
});

test('does not warn a user with no last_active_at at all', function () {
    Mail::fake();

    User::factory()->create([
        'last_active_at' => null,
        'inactivity_warning_sent_at' => null,
    ]);

    $this->artisan('accounts:warn-inactive');

    Mail::assertNothingSent();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=WarnInactiveAccountsTest`
Expected: FAIL — command `accounts:warn-inactive` does not exist.

- [ ] **Step 3: Create the command**

```php
<?php

namespace App\Console\Commands;

use App\Mail\InactivityWarning;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class WarnInactiveAccounts extends Command
{
    protected $signature = 'accounts:warn-inactive';

    protected $description = 'Email users whose accounts are approaching the inactivity tombstone threshold.';

    public function handle(): int
    {
        $warningCutoff = now()->subDays(config('inactivity.warning_after_days'));
        $tombstoneCutoff = now()->subDays(config('inactivity.tombstone_after_days'));

        User::query()
            ->whereNotNull('last_active_at')
            ->where('last_active_at', '<=', $warningCutoff)
            ->where('last_active_at', '>', $tombstoneCutoff)
            ->whereNull('inactivity_warning_sent_at')
            ->each(function (User $user) {
                Mail::to($user->email)->send(new InactivityWarning($user));
                $user->update(['inactivity_warning_sent_at' => now()]);
            });

        return self::SUCCESS;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact --filter=WarnInactiveAccountsTest`
Expected: PASS

- [ ] **Step 5: Register the schedule**

Modify `routes/console.php`:

```php
<?php

use App\Console\Commands\WarnInactiveAccounts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command(WarnInactiveAccounts::class)->daily();
```

(Task 8 will add the second `Schedule::command(...)` line and its `use` import to this same file.)

- [ ] **Step 6: Verify the schedule is registered**

Run: `php artisan schedule:list`
Expected: shows `accounts:warn-inactive` running daily.

- [ ] **Step 7: Commit**

```bash
git add app/Console/Commands/WarnInactiveAccounts.php routes/console.php tests/Feature/Console/WarnInactiveAccountsTest.php
git commit -m "🎇 Add accounts:warn-inactive scheduled command"
```

---

### Task 8: `accounts:tombstone-inactive` command

**Files:**
- Create: `app/Console/Commands/TombstoneInactiveAccounts.php`
- Modify: `routes/console.php`
- Test: `tests/Feature/Console/TombstoneInactiveAccountsTest.php`

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Mail\AccountTombstoned;
use App\Models\Passkey;
use App\Models\PasskeyRecoveryToken;
use App\Models\SocialAccount;
use App\Models\Tombstone;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

test('archives passkeys and social accounts, cancels subscription, emails, and deletes the user', function () {
    Mail::fake();

    $user = User::factory()->create([
        'name' => 'Ada Lovelace',
        'email' => 'ada@example.com',
        'last_active_at' => now()->subDays(91),
    ]);
    $passkey = Passkey::factory()->for($user)->create([
        'name' => 'YubiKey',
        'credential_id' => 'cred-abc',
        'public_key' => 'pubkey-abc',
        'sign_count' => 3,
        'transports' => ['usb'],
    ]);
    $socialAccount = SocialAccount::factory()->for($user)->create([
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'access_token' => 'super-secret-token',
    ]);
    PasskeyRecoveryToken::createForUser($user, 'leftover-token');

    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    $tombstone = Tombstone::where('email', 'ada@example.com')->first();
    expect($tombstone)->not->toBeNull();
    expect($tombstone->name)->toBe('Ada Lovelace');
    expect($tombstone->schema_version)->toBe(Tombstone::CURRENT_SCHEMA_VERSION);
    expect($tombstone->original_user_id)->toBe($user->id);
    expect($tombstone->archived_passkeys)->toBe([[
        'credential_id' => 'cred-abc',
        'public_key' => 'pubkey-abc',
        'sign_count' => 3,
        'transports' => ['usb'],
        'name' => 'YubiKey',
    ]]);
    expect($tombstone->archived_social_accounts)->toBe([$socialAccount->toArchive()]);

    foreach ($tombstone->archived_social_accounts as $archived) {
        expect($archived)->not->toHaveKey('access_token');
    }

    Mail::assertSent(AccountTombstoned::class, fn ($mail) => $mail->name === 'Ada Lovelace');

    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    $this->assertDatabaseMissing('passkeys', ['id' => $passkey->id]);
    $this->assertDatabaseMissing('social_accounts', ['id' => $socialAccount->id]);
    $this->assertDatabaseMissing('passkey_recovery_tokens', ['user_id' => $user->id]);
});

test('does not touch a user who is still within the active window', function () {
    Mail::fake();

    $user = User::factory()->create(['last_active_at' => now()->subDays(50)]);

    $this->artisan('accounts:tombstone-inactive');

    $this->assertDatabaseHas('users', ['id' => $user->id]);
    Mail::assertNothingSent();
});

test('tombstones exactly at the 90-day boundary', function () {
    Mail::fake();

    $user = User::factory()->create(['last_active_at' => now()->subDays(90)]);

    $this->artisan('accounts:tombstone-inactive');

    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    expect(Tombstone::where('email', $user->email)->exists())->toBeTrue();
});

test('a failure for one user is logged and does not block the rest of the batch', function () {
    Mail::fake();
    Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP down'));

    $user = User::factory()->create(['last_active_at' => now()->subDays(95)]);

    $this->artisan('accounts:tombstone-inactive')->assertExitCode(0);

    // Transaction rolled back for this user — nothing partially committed.
    $this->assertDatabaseHas('users', ['id' => $user->id]);
    expect(Tombstone::where('email', $user->email)->exists())->toBeFalse();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=TombstoneInactiveAccountsTest`
Expected: FAIL — command doesn't exist.

- [ ] **Step 3: Create the command**

```php
<?php

namespace App\Console\Commands;

use App\Mail\AccountTombstoned;
use App\Models\Tombstone;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class TombstoneInactiveAccounts extends Command
{
    protected $signature = 'accounts:tombstone-inactive';

    protected $description = 'Archive and delete accounts that have been inactive past the tombstone threshold.';

    public function handle(): int
    {
        $cutoff = now()->subDays(config('inactivity.tombstone_after_days'));

        User::query()
            ->whereNotNull('last_active_at')
            ->where('last_active_at', '<=', $cutoff)
            ->with(['passkeys', 'socialAccounts'])
            ->each(function (User $user) {
                try {
                    $this->tombstone($user);
                } catch (Throwable $e) {
                    Log::error('Failed to tombstone inactive account', [
                        'user_id' => $user->id,
                        'exception' => $e->getMessage(),
                    ]);
                }
            });

        return self::SUCCESS;
    }

    private function tombstone(User $user): void
    {
        DB::transaction(function () use ($user) {
            $archivedPasskeys = $user->passkeys->map(fn ($passkey) => [
                'credential_id' => $passkey->credential_id,
                'public_key' => $passkey->public_key,
                'sign_count' => $passkey->sign_count,
                'transports' => $passkey->transports,
                'name' => $passkey->name,
            ])->all();

            $archivedSocialAccounts = $user->socialAccounts
                ->map(fn ($account) => $account->toArchive())
                ->all();

            $user->cancelSubscription();

            Tombstone::create([
                'email' => $user->email,
                'name' => $user->name,
                'schema_version' => Tombstone::CURRENT_SCHEMA_VERSION,
                'archived_passkeys' => $archivedPasskeys,
                'archived_social_accounts' => $archivedSocialAccounts,
                'original_user_id' => $user->id,
                'tombstoned_at' => now(),
            ]);

            Mail::to($user->email)->send(new AccountTombstoned($user->name));

            $user->delete();
        });
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact --filter=TombstoneInactiveAccountsTest`
Expected: PASS

- [ ] **Step 5: Register the schedule**

Modify `routes/console.php` to add the second command:

```php
<?php

use App\Console\Commands\TombstoneInactiveAccounts;
use App\Console\Commands\WarnInactiveAccounts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command(WarnInactiveAccounts::class)->daily();
Schedule::command(TombstoneInactiveAccounts::class)->daily();
```

- [ ] **Step 6: Verify the schedule**

Run: `php artisan schedule:list`
Expected: both `accounts:warn-inactive` and `accounts:tombstone-inactive` listed as daily.

- [ ] **Step 7: Commit**

```bash
git add app/Console/Commands/TombstoneInactiveAccounts.php routes/console.php tests/Feature/Console/TombstoneInactiveAccountsTest.php
git commit -m "🎇 Add accounts:tombstone-inactive scheduled command"
```

---

### Task 9: `PasskeyAuthController` tombstone fallback + activity stamping

**Files:**
- Modify: `app/Http/Controllers/Auth/PasskeyAuthController.php`
- Test: `tests/Feature/Auth/PasskeyAuthTombstoneTest.php`

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\Tombstone;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\Uid\Uuid;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\TrustPath\EmptyTrustPath;

function tombstoneAuthOptions(): PublicKeyCredentialRequestOptions
{
    return new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
}

test('a verified tombstoned credential redirects to the archived interstitial instead of logging in', function () {
    $tombstone = Tombstone::factory()->create([
        'archived_passkeys' => [[
            'credential_id' => base64_encode('tombstoned-cred'),
            'public_key' => base64_encode('tombstoned-pubkey'),
            'sign_count' => 4,
            'transports' => ['internal'],
            'name' => 'Old Phone',
        ]],
    ]);

    $credentialRecord = new CredentialRecord(
        publicKeyCredentialId: base64_decode(base64_encode('tombstoned-cred')),
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: base64_decode(base64_encode('tombstoned-pubkey')),
        userHandle: '',
        counter: 5,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andReturn($credentialRecord);

    $token = 'tombstone-token';
    Cache::put("passkey_auth:{$token}", serialize(tombstoneAuthOptions()), 300);

    $rawId = rtrim(strtr(base64_encode('tombstoned-cred'), '+/', '-_'), '=');

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id' => $rawId,
        'rawId' => $rawId,
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ], ['X-Passkey-Token' => $token]);

    $response->assertOk();
    $response->assertJson(['redirect' => route('tombstone.show')]);
    $this->assertGuest();
    expect(session('tombstone_id'))->toBe($tombstone->id);
});

test('a tombstoned credential with a bad signature gets the identical generic failure as any bad attempt', function () {
    Tombstone::factory()->create([
        'archived_passkeys' => [[
            'credential_id' => base64_encode('tombstoned-cred-2'),
            'public_key' => base64_encode('tombstoned-pubkey-2'),
            'sign_count' => 4,
            'transports' => ['internal'],
            'name' => 'Old Phone',
        ]],
    ]);

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andThrow(new \Exception('bad signature'));

    $token = 'tombstone-token-bad-sig';
    Cache::put("passkey_auth:{$token}", serialize(tombstoneAuthOptions()), 300);

    $rawId = rtrim(strtr(base64_encode('tombstoned-cred-2'), '+/', '-_'), '=');

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id' => $rawId,
        'rawId' => $rawId,
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ], ['X-Passkey-Token' => $token]);

    $response->assertUnauthorized();
    $response->assertJson(['message' => 'Passkey verification failed.']);
    $this->assertGuest();
});

test('login stamps last_active_at and clears any pending inactivity warning', function () {
    $user = User::factory()->create([
        'last_active_at' => now()->subDays(50),
        'inactivity_warning_sent_at' => now()->subDay(),
    ]);
    $passkey = \App\Models\Passkey::factory()->for($user)->create(['sign_count' => 0]);

    $updatedRecord = new CredentialRecord(
        publicKeyCredentialId: base64_decode($passkey->credential_id),
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: base64_decode($passkey->public_key),
        userHandle: (string) $user->id,
        counter: 1,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andReturn($updatedRecord);

    $token = 'login-activity-token';
    Cache::put("passkey_auth:{$token}", serialize(tombstoneAuthOptions()), 300);

    $rawId = rtrim(strtr(base64_encode(base64_decode($passkey->credential_id)), '+/', '-_'), '=');

    $this->postJson(route('passkey.auth.authenticate'), [
        'id' => $rawId,
        'rawId' => $rawId,
        'type' => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON' => base64_encode('{}'),
            'signature' => base64_encode('sig'),
        ],
    ], ['X-Passkey-Token' => $token])->assertOk();

    $fresh = $user->fresh();
    expect($fresh->last_active_at->isToday())->toBeTrue();
    expect($fresh->inactivity_warning_sent_at)->toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=PasskeyAuthTombstoneTest`
Expected: FAIL — no tombstone fallback exists yet, `tombstone.show` route doesn't exist yet (add a temporary placeholder route in this step's test run, or proceed to Step 3 first then re-run — **note:** Task 11 adds `tombstone.show`; run this task's Step 2 failure check by asserting on the 401/`Passkey not recognised` behavior only until Task 11 lands, then fully re-verify after Task 11. Simplest path: implement Task 11 (`TombstoneController` + routes) before running this task's tests for real, since `route('tombstone.show')` must resolve. **Execution order note:** do Task 11 before Task 9's Step 2 run, or do Tasks 9 and 11 together in one working session before running either test file.)

- [ ] **Step 3: Update `PasskeyAuthController`**

Replace the full contents of `app/Http/Controllers/Auth/PasskeyAuthController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Models\Tombstone;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Throwable;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\Denormalizer\WebauthnSerializerFactory;

class PasskeyAuthController extends Controller
{
    public function __construct(private readonly WebAuthnService $webAuthn) {}

    public function options(): Response
    {
        return $this->buildOptionsResponse(
            $this->webAuthn->generateAuthenticationOptions(),
            'passkey_auth',
        );
    }

    public function authenticate(Request $request): JsonResponse
    {
        $result = $this->resolveVerifiedPasskey($request, cachePrefix: 'passkey_auth');
        if ($result instanceof JsonResponse) {
            return $result;
        }

        if (isset($result['tombstone'])) {
            $request->session()->put('tombstone_id', $result['tombstone']->id);
            $request->session()->put('tombstone_credential_id', $result['credential_id']);

            return response()->json(['redirect' => route('tombstone.show')]);
        }

        $passkey = $result['passkey'];
        Auth::login($passkey->user);
        $passkey->user->update([
            'last_active_at' => now(),
            'inactivity_warning_sent_at' => null,
        ]);

        return response()->json(['redirect' => route('dashboard')]);
    }

    public function confirmOptions(Request $request): Response
    {
        return $this->buildOptionsResponse(
            $this->webAuthn->generateAuthenticationOptionsForUser($request->user()),
            'passkey_confirm',
        );
    }

    public function confirm(Request $request): JsonResponse
    {
        $result = $this->resolveVerifiedPasskey($request, $request->user()->id, 'passkey_confirm');
        if ($result instanceof JsonResponse) {
            return $result;
        }

        $request->session()->put('passkey_confirmed_at', time());

        return response()->json(['confirmed' => true]);
    }

    private function buildOptionsResponse(mixed $options, string $cachePrefix): Response
    {
        $token = Str::random(40);
        Cache::put("{$cachePrefix}:{$token}", serialize($options), 300);

        $serializer = (new WebauthnSerializerFactory(
            new AttestationStatementSupportManager([new NoneAttestationStatementSupport])
        ))->create();

        return response($serializer->serialize($options, 'json'), 200, [
            'Content-Type' => 'application/json',
            'X-Passkey-Token' => $token,
        ]);
    }

    /** @return array{passkey: Passkey}|array{tombstone: Tombstone, credential_id: string}|JsonResponse */
    private function resolveVerifiedPasskey(
        Request $request,
        ?int $requiredUserId = null,
        string $cachePrefix = 'passkey_auth',
    ): array|JsonResponse {
        $token = $request->header('X-Passkey-Token');
        $serialized = $token ? Cache::pull("{$cachePrefix}:{$token}") : null;
        if (! $serialized) {
            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        try {
            $options = unserialize($serialized);
        } catch (Throwable $e) {
            Log::warning('Failed to unserialize passkey challenge', ['exception' => $e->getMessage()]);

            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        $rawId = $request->input('rawId');
        if (! is_string($rawId) || $rawId === '') {
            return response()->json(['message' => 'Invalid credential.'], 422);
        }

        $base64 = strtr($rawId, '-_', '+/');
        $padded = str_pad($base64, (int) ceil(strlen($base64) / 4) * 4, '=');
        $decoded = base64_decode($padded, strict: true);
        if ($decoded === false) {
            return response()->json(['message' => 'Invalid credential.'], 422);
        }
        $credentialId = base64_encode($decoded);

        $query = Passkey::where('credential_id', $credentialId);
        if ($requiredUserId !== null) {
            $query->where('user_id', $requiredUserId);
        }
        $passkey = $query->first();

        if (! $passkey) {
            if ($requiredUserId !== null) {
                return response()->json(['message' => 'Passkey not recognised.'], 401);
            }

            $tombstoneMatch = $this->findTombstoneByCredentialId($credentialId);
            if (! $tombstoneMatch) {
                return response()->json(['message' => 'Passkey not recognised.'], 401);
            }

            return $this->verifyTombstonedPasskey($tombstoneMatch, $request, $options, $credentialId);
        }

        try {
            $source = $this->webAuthn->verifyAuthentication(
                json_encode($request->all()),
                $options,
                $passkey,
            );
        } catch (Throwable $e) {
            Log::warning('Passkey authentication verification failed', [
                'exception' => $e->getMessage(),
                'user_id' => $requiredUserId,
            ]);

            return response()->json(['message' => 'Passkey verification failed.'], 401);
        }

        // A counter of 0 means the authenticator doesn't implement counters; only check for
        // equal-or-lower counters when the authenticator tracks them, per WebAuthn §6.1.
        if ($source->counter !== 0 && $source->counter <= $passkey->sign_count) {
            /** @var User $user */
            $user = $passkey->user;
            Mail::to($user->email)->send(new PasskeyInvalidated($passkey, automatic: true));
            $passkey->delete();

            return response()->json(['message' => 'Passkey invalidated due to replay attack.'], 401);
        }

        $passkey->update([
            'sign_count' => $source->counter,
            'last_used_at' => now(),
        ]);

        return ['passkey' => $passkey];
    }

    /** @return array{tombstone: Tombstone, archived_passkey: array<string, mixed>}|null */
    private function findTombstoneByCredentialId(string $credentialId): ?array
    {
        foreach (Tombstone::select(['id', 'schema_version', 'archived_passkeys'])->cursor() as $tombstone) {
            $match = collect($tombstone->archived_passkeys)->firstWhere('credential_id', $credentialId);

            if ($match) {
                return ['tombstone' => $tombstone, 'archived_passkey' => $match];
            }
        }

        return null;
    }

    /** @return array{tombstone: Tombstone, credential_id: string}|JsonResponse */
    private function verifyTombstonedPasskey(
        array $tombstoneMatch,
        Request $request,
        mixed $options,
        string $credentialId,
    ): array|JsonResponse {
        /** @var Tombstone $tombstone */
        $tombstone = $tombstoneMatch['tombstone'];
        $archived = $tombstoneMatch['archived_passkey'];

        if ($tombstone->schema_version !== Tombstone::CURRENT_SCHEMA_VERSION) {
            Log::warning('Tombstone passkey lookup hit an unrecognised schema version', [
                'tombstone_id' => $tombstone->id,
                'schema_version' => $tombstone->schema_version,
            ]);

            return response()->json(['message' => 'Passkey verification failed.'], 401);
        }

        $transientPasskey = new Passkey([
            'credential_id' => $archived['credential_id'],
            'public_key' => $archived['public_key'],
            'sign_count' => $archived['sign_count'],
            'transports' => $archived['transports'],
        ]);

        try {
            $this->webAuthn->verifyAuthentication(
                json_encode($request->all()),
                $options,
                $transientPasskey,
            );
        } catch (Throwable $e) {
            Log::warning('Tombstoned passkey verification failed', ['exception' => $e->getMessage()]);

            return response()->json(['message' => 'Passkey verification failed.'], 401);
        }

        return ['tombstone' => $tombstone, 'credential_id' => $credentialId];
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact --filter="PasskeyAuthTombstoneTest|PasskeyAuthTest"`
Expected: PASS for both files (the pre-existing `PasskeyAuthTest.php` must still pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Auth/PasskeyAuthController.php tests/Feature/Auth/PasskeyAuthTombstoneTest.php
git commit -m "🎇 Fall back to tombstone lookup on failed passkey login"
```

---

### Task 10: Stamp `last_active_at` on passkey registration

**Files:**
- Modify: `app/Http/Controllers/Settings/PasskeyController.php`
- Test: `tests/Feature/Settings/PasskeyRegistrationActivityTest.php`

- [ ] **Step 1: Write the failing test**

```php
<?php

use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Support\Facades\Cache;
use Webauthn\CredentialRecord;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\TrustPath\EmptyTrustPath;
use Symfony\Component\Uid\Uuid;

test('registering a passkey stamps last_active_at', function () {
    $user = User::factory()->create(['last_active_at' => null]);
    $this->actingAs($user);

    $options = new PublicKeyCredentialCreationOptions(
        rp: new \Webauthn\PublicKeyCredentialRpEntity(name: 'Bloom', id: 'localhost'),
        user: new \Webauthn\PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );
    Cache::tags(['user:'.$user->id])->put('passkey_register_challenge', serialize($options), 300);

    $record = new CredentialRecord(
        publicKeyCredentialId: random_bytes(16),
        type: 'public-key',
        transports: ['internal'],
        attestationType: 'none',
        trustPath: new EmptyTrustPath,
        aaguid: Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        credentialPublicKey: random_bytes(32),
        userHandle: (string) $user->id,
        counter: 0,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('generateRegistrationOptions')
        ->andReturn($options)
        ->shouldReceive('verifyRegistration')
        ->once()
        ->andReturn($record)
        ->shouldReceive('credentialRecordToArray')
        ->once()
        ->andReturn([
            'credential_id' => base64_encode('cred-id'),
            'public_key' => base64_encode('pubkey'),
            'sign_count' => 0,
            'transports' => ['internal'],
        ]);

    $this->postJson(route('passkey.register.store'), ['name' => 'New Key'])->assertCreated();

    expect($user->fresh()->last_active_at)->not->toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php artisan test --compact --filter="registering a passkey stamps last_active_at"`
Expected: FAIL — `last_active_at` stays null.

- [ ] **Step 3: Update `PasskeyController::store()`**

In `app/Http/Controllers/Settings/PasskeyController.php`, change the end of `store()`:

```php
    public function store(Request $request): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:255']]);

        $serialized = Cache::tags(['user:'.$request->user()->id])->pull('passkey_register_challenge');

        if (! $serialized) {
            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        $options = unserialize($serialized);

        try {
            $source = $this->webAuthn->verifyRegistration(
                json_encode($request->except('name')),
                $options,
            );
        } catch (Throwable $e) {
            Log::warning('Passkey registration verification failed', ['exception' => $e->getMessage()]);

            return response()->json(['message' => 'Passkey verification failed. Please try again.'], 422);
        }

        $data = $this->webAuthn->credentialRecordToArray($source);

        if (Passkey::where('credential_id', $data['credential_id'])->exists()) {
            return response()->json(['message' => 'This passkey is already registered.'], 422);
        }

        $passkey = $request->user()->passkeys()->create([
            'name' => $request->input('name'),
            ...$data,
        ]);

        $request->user()->update(['last_active_at' => now(), 'inactivity_warning_sent_at' => null]);

        return response()->json($passkey->only('id', 'name', 'last_used_at', 'created_at'), 201);
    }
```

(Only the body of `store()` changes — leave `registerOptions()` and `destroy()` untouched.)

- [ ] **Step 4: Run test to verify it passes**

Run: `php artisan test --compact --filter=PasskeyRegistrationActivityTest`
Expected: PASS. Also re-run the pre-existing suite: `php artisan test --compact --filter=PasskeySettingsTest` to confirm no regression.

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Settings/PasskeyController.php tests/Feature/Settings/PasskeyRegistrationActivityTest.php
git commit -m "🎇 Stamp last_active_at on passkey registration"
```

---

### Task 11: `TombstoneController` + routes + frontend page

**Files:**
- Create: `app/Http/Controllers/Auth/TombstoneController.php`
- Modify: `routes/web.php`
- Create: `resources/js/pages/auth/tombstone.tsx`
- Test: `tests/Feature/Auth/TombstoneControllerTest.php`

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Models\SocialAccount;
use App\Models\Tombstone;
use Inertia\Testing\AssertableInertia as Assert;

test('show renders the archived interstitial when session has a tombstone_id', function () {
    $tombstone = Tombstone::factory()->create(['name' => 'Ada Lovelace', 'email' => 'ada@example.com']);

    $this->withoutVite()
        ->withSession(['tombstone_id' => $tombstone->id])
        ->get(route('tombstone.show'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('auth/tombstone')
            ->where('name', 'Ada Lovelace')
            ->where('email', 'ada@example.com')
        );
});

test('show redirects to login when there is no tombstone_id in session', function () {
    $this->get(route('tombstone.show'))
        ->assertRedirect(route('login'));
});

test('destroy permanently deletes the tombstone and its recovery tokens', function () {
    $tombstone = Tombstone::factory()->create();
    $recoveryToken = \App\Models\TombstoneRecoveryToken::createForTombstone($tombstone, 'a-token');

    $this->withSession(['tombstone_id' => $tombstone->id])
        ->delete(route('tombstone.destroy'))
        ->assertRedirect(route('login'));

    $this->assertDatabaseMissing('tombstones', ['id' => $tombstone->id]);
    $this->assertDatabaseMissing('tombstone_recovery_tokens', ['id' => $recoveryToken->id]);
    $this->assertGuest();
});

test('destroy without a session tombstone_id redirects to login without deleting anything', function () {
    $tombstone = Tombstone::factory()->create();

    $this->delete(route('tombstone.destroy'))->assertRedirect(route('login'));

    $this->assertDatabaseHas('tombstones', ['id' => $tombstone->id]);
});

test('resurrect recreates the verified passkey and flags social accounts for reconnect', function () {
    $tombstone = Tombstone::factory()->create([
        'email' => 'ada@example.com',
        'name' => 'Ada Lovelace',
        'archived_passkeys' => [[
            'credential_id' => 'cred-abc',
            'public_key' => 'pubkey-abc',
            'sign_count' => 3,
            'transports' => ['usb'],
            'name' => 'YubiKey',
        ]],
        'archived_social_accounts' => [
            SocialAccount::factory()->make(['provider' => 'mastodon', 'feed_type' => 'home'])->toArchive(),
        ],
    ]);

    $this->withSession([
        'tombstone_id' => $tombstone->id,
        'tombstone_credential_id' => 'cred-abc',
    ])->post(route('tombstone.resurrect'))
        ->assertRedirect(route('feed'));

    $this->assertDatabaseMissing('tombstones', ['id' => $tombstone->id]);

    $newUser = \App\Models\User::where('email', 'ada@example.com')->first();
    expect($newUser)->not->toBeNull();
    $this->assertAuthenticatedAs($newUser);

    $passkey = $newUser->passkeys()->first();
    expect($passkey)->not->toBeNull();
    expect($passkey->credential_id)->toBe('cred-abc');

    $socialAccount = $newUser->socialAccounts()->first();
    expect($socialAccount)->not->toBeNull();
    expect($socialAccount->auth_failed_at)->not->toBeNull();
    expect($socialAccount->access_token)->toBeNull();
});

test('resurrect via the email-recovery path (no verified credential) creates a user with no passkey', function () {
    $tombstone = Tombstone::factory()->create([
        'email' => 'bob@example.com',
        'name' => 'Bob',
        'archived_passkeys' => [['credential_id' => 'cred-xyz', 'public_key' => 'k', 'sign_count' => 0, 'transports' => [], 'name' => 'Phone']],
        'archived_social_accounts' => [],
    ]);

    $this->withSession(['tombstone_id' => $tombstone->id])
        ->post(route('tombstone.resurrect'))
        ->assertRedirect(route('feed'));

    $newUser = \App\Models\User::where('email', 'bob@example.com')->first();
    expect($newUser->passkeys()->count())->toBe(0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=TombstoneControllerTest`
Expected: FAIL — `TombstoneController`, routes, and `auth/tombstone` page don't exist.

- [ ] **Step 3: Create `TombstoneController`**

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\Tombstone;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class TombstoneController extends Controller
{
    public function show(Request $request): RedirectResponse|Response
    {
        $tombstone = $this->resolveSessionTombstone($request);

        if (! $tombstone) {
            return redirect()->route('login');
        }

        return Inertia::render('auth/tombstone', [
            'name' => $tombstone->name,
            'email' => $tombstone->email,
        ]);
    }

    public function destroy(Request $request): RedirectResponse
    {
        $tombstone = $this->resolveSessionTombstone($request);

        if (! $tombstone) {
            return redirect()->route('login');
        }

        $tombstone->delete();
        $request->session()->forget(['tombstone_id', 'tombstone_credential_id']);

        return redirect()->route('login')->with('status', 'account-deleted');
    }

    public function resurrect(Request $request): RedirectResponse
    {
        $tombstone = $this->resolveSessionTombstone($request);

        if (! $tombstone) {
            return redirect()->route('login');
        }

        $user = User::create([
            'name' => $tombstone->name,
            'email' => $tombstone->email,
            'last_active_at' => now(),
        ]);

        $verifiedCredentialId = $request->session()->get('tombstone_credential_id');
        $archivedPasskey = $verifiedCredentialId
            ? collect($tombstone->archived_passkeys)->firstWhere('credential_id', $verifiedCredentialId)
            : null;

        if ($archivedPasskey) {
            $user->passkeys()->create([
                'name' => $archivedPasskey['name'],
                'credential_id' => $archivedPasskey['credential_id'],
                'public_key' => $archivedPasskey['public_key'],
                'sign_count' => $archivedPasskey['sign_count'],
                'transports' => $archivedPasskey['transports'],
            ]);
        }

        foreach ($tombstone->archived_social_accounts as $archivedAccount) {
            $user->socialAccounts()->create(
                SocialAccount::rehydrate($archivedAccount, $tombstone->schema_version)
            );
        }

        $tombstone->delete();
        $request->session()->forget(['tombstone_id', 'tombstone_credential_id']);

        Auth::login($user);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => __('Welcome back! Please reconnect your social accounts.'),
        ]);

        return redirect()->route('feed');
    }

    private function resolveSessionTombstone(Request $request): ?Tombstone
    {
        $id = $request->session()->get('tombstone_id');

        return $id ? Tombstone::find($id) : null;
    }
}
```

- [ ] **Step 4: Add routes**

In `routes/web.php`, add the import and the three routes inside the existing `Route::middleware('guest')->group(...)` block (these are reachable pre-login, mirroring the recovery routes):

```php
use App\Http\Controllers\Auth\TombstoneController;
```

```php
Route::middleware('guest')->group(function () {
    Route::get('login', [AuthenticatedSessionController::class, 'create'])->name('login');
    Route::get('register', [RegisteredUserController::class, 'create'])->name('register');
    Route::post('register', [RegisteredUserController::class, 'store'])->name('register.store');

    Route::get('recover', [PasskeyRecoveryController::class, 'create'])->name('passkey.recover');
    Route::post('recover', [PasskeyRecoveryController::class, 'store'])
        ->middleware('throttle:5,1')
        ->name('passkey.recover.store');
    Route::get('recover/sent', [PasskeyRecoveryController::class, 'sent'])->name('passkey.recover.sent');
    Route::get('recover/{token}', [PasskeyRecoveryController::class, 'setup'])
        ->middleware('throttle:10,1')
        ->name('passkey.recover.setup');

    Route::get('auth/passkey/options', [PasskeyAuthController::class, 'options'])
        ->name('passkey.auth.options');
    Route::post('auth/passkey/authenticate', [PasskeyAuthController::class, 'authenticate'])
        ->middleware('throttle:10,1')
        ->name('passkey.auth.authenticate');

    Route::get('account/archived', [TombstoneController::class, 'show'])->name('tombstone.show');
    Route::delete('account/archived', [TombstoneController::class, 'destroy'])->name('tombstone.destroy');
    Route::post('account/archived/resurrect', [TombstoneController::class, 'resurrect'])->name('tombstone.resurrect');
});
```

- [ ] **Step 5: Generate Wayfinder actions for the new controller**

Run: `php artisan wayfinder:generate`
Expected: creates `resources/js/actions/App/Http/Controllers/Auth/TombstoneController.ts` (and route helpers) — commit these generated files alongside the rest of this task.

- [ ] **Step 6: Create the frontend page**

```tsx
import { router } from '@inertiajs/react';
import { useState } from 'react';
import TombstoneController from '@/actions/App/Http/Controllers/Auth/TombstoneController';
import { Head } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';

type TombstoneProps = {
    name: string;
    email: string;
};

export default function Tombstone({ name, email }: TombstoneProps) {
    const [resurrecting, setResurrecting] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleResurrect = () => {
        setResurrecting(true);
        router.post(TombstoneController.resurrect.url(), {}, {
            onFinish: () => setResurrecting(false),
        });
    };

    const handleDelete = () => {
        setDeleting(true);
        router.delete(TombstoneController.destroy.url(), {
            onFinish: () => setDeleting(false),
        });
    };

    return (
        <>
            <Head title="Account archived" />
            <div className="flex flex-col gap-6 text-center">
                <p className="text-muted-foreground text-sm">
                    {name}'s account ({email}) was archived after a long
                    period of inactivity. You can bring it back as a fresh
                    account — you'll need to reconnect your social feeds — or
                    delete it for good.
                </p>

                <Button
                    onClick={handleResurrect}
                    disabled={resurrecting || deleting}
                    data-test="resurrect-account-button"
                >
                    {resurrecting && <Spinner />}
                    Bring my account back
                </Button>

                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="destructive"
                            disabled={resurrecting || deleting}
                            data-test="delete-tombstone-button"
                        >
                            Delete permanently
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogTitle>Delete this account permanently?</DialogTitle>
                        <DialogDescription>
                            This cannot be undone. Your archived passkeys and
                            social account metadata will be permanently
                            erased.
                        </DialogDescription>

                        <DialogFooter className="gap-2">
                            <DialogClose asChild>
                                <Button variant="secondary">Cancel</Button>
                            </DialogClose>

                            <Button
                                variant="destructive"
                                disabled={deleting}
                                onClick={handleDelete}
                                data-test="confirm-delete-tombstone-button"
                            >
                                {deleting && <Spinner />}
                                Delete permanently
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}

Tombstone.layout = {
    title: 'Account archived',
    description: 'This account was archived due to inactivity',
};
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `php artisan test --compact --filter=TombstoneControllerTest`
Expected: PASS

- [ ] **Step 8: Also re-run Task 9's tests now that `tombstone.show` exists**

Run: `php artisan test --compact --filter="PasskeyAuthTombstoneTest|PasskeyAuthTest"`
Expected: PASS

- [ ] **Step 9: Build the frontend to confirm no TypeScript/Vite errors**

Run: `npm run build`
Expected: build succeeds with no type errors referencing `TombstoneController` or the new page.

- [ ] **Step 10: Commit**

```bash
git add app/Http/Controllers/Auth/TombstoneController.php routes/web.php resources/js/pages/auth/tombstone.tsx resources/js/actions/App/Http/Controllers/Auth/TombstoneController.ts tests/Feature/Auth/TombstoneControllerTest.php
git commit -m "🎇 Add archived-account interstitial (show/destroy/resurrect)"
```

---

### Task 12: `PasskeyRecoveryController` tombstone branch

**Files:**
- Modify: `app/Http/Controllers/Auth/PasskeyRecoveryController.php`
- Test: `tests/Feature/Auth/PasskeyRecoveryTombstoneTest.php`

- [ ] **Step 1: Write the failing tests**

```php
<?php

use App\Mail\TombstoneRecovery;
use App\Models\Tombstone;
use App\Models\TombstoneRecoveryToken;
use Illuminate\Support\Facades\Mail;

test('recovery for a tombstoned email sends a tombstone-recovery email and redirects identically to a live account', function () {
    Mail::fake();

    $tombstone = Tombstone::factory()->create(['email' => 'ada@example.com']);

    $this->post(route('passkey.recover.store'), ['email' => 'ada@example.com'])
        ->assertRedirect(route('passkey.recover.sent'));

    Mail::assertSent(TombstoneRecovery::class, fn ($mail) => $mail->hasTo('ada@example.com'));
    expect(TombstoneRecoveryToken::where('tombstone_id', $tombstone->id)->count())->toBe(1);
});

test('a valid tombstone recovery token stashes tombstone_id and redirects to the archived interstitial', function () {
    $tombstone = Tombstone::factory()->create();
    TombstoneRecoveryToken::createForTombstone($tombstone, 'valid-tombstone-token');

    $this->get(route('passkey.recover.setup', 'valid-tombstone-token'))
        ->assertRedirect(route('tombstone.show'));

    expect(session('tombstone_id'))->toBe($tombstone->id);
    $this->assertGuest();
});

test('an expired tombstone recovery token shows the invalid page, same as an expired live-account token', function () {
    $tombstone = Tombstone::factory()->create();
    $record = TombstoneRecoveryToken::createForTombstone($tombstone, 'expired-tombstone-token');
    $record->created_at = now()->subHours(2);
    $record->save();

    $this->withoutVite()
        ->get(route('passkey.recover.setup', 'expired-tombstone-token'))
        ->assertOk()
        ->assertInertia(fn (\Inertia\Testing\AssertableInertia $page) => $page->component('auth/recover-invalid'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --compact --filter=PasskeyRecoveryTombstoneTest`
Expected: FAIL — no tombstone branch exists yet.

- [ ] **Step 3: Update `PasskeyRecoveryController`**

Replace the full contents of `app/Http/Controllers/Auth/PasskeyRecoveryController.php`:

```php
<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyRecovery;
use App\Mail\TombstoneRecovery;
use App\Models\PasskeyRecoveryToken;
use App\Models\Tombstone;
use App\Models\TombstoneRecoveryToken;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Throwable;

class PasskeyRecoveryController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('auth/recover');
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate(['email' => 'required|email']);

        $email = strtolower($request->input('email'));
        $user = User::where('email', $email)->first();

        if ($user) {
            $this->sendUserRecovery($user);
        } else {
            $tombstone = Tombstone::where('email', $email)->first();

            if ($tombstone) {
                $this->sendTombstoneRecovery($tombstone);
            }
        }

        // Always redirect with the same message to prevent email enumeration.
        // Note: response timing is not equalised; a found user/tombstone triggers
        // token creation before this line.
        return redirect()->route('passkey.recover.sent');
    }

    public function sent(): Response
    {
        return Inertia::render('auth/recover-sent');
    }

    public function setup(string $token): RedirectResponse|Response
    {
        $hashedToken = hash('sha256', $token);

        $passkeyRecord = PasskeyRecoveryToken::where('token', $hashedToken)
            ->whereNull('used_at')
            ->where('created_at', '>', now()->subHour())
            ->with('user')
            ->first();

        if ($passkeyRecord) {
            $user = $passkeyRecord->user;

            if (! $user) {
                Log::warning('Passkey recovery token referenced a deleted user', ['token_id' => $passkeyRecord->id]);

                return Inertia::render('auth/recover-invalid');
            }

            $passkeyRecord->consume();
            Auth::login($user);

            return redirect()->route('passkey.setup')->with('status', 'recovery');
        }

        $tombstoneRecord = TombstoneRecoveryToken::where('token', $hashedToken)
            ->whereNull('used_at')
            ->where('created_at', '>', now()->subHour())
            ->with('tombstone')
            ->first();

        if ($tombstoneRecord && $tombstoneRecord->tombstone) {
            $tombstoneRecord->consume();
            session(['tombstone_id' => $tombstoneRecord->tombstone->id]);

            return redirect()->route('tombstone.show');
        }

        return Inertia::render('auth/recover-invalid');
    }

    private function sendUserRecovery(User $user): void
    {
        PasskeyRecoveryToken::where('user_id', $user->id)
            ->whereNull('used_at')
            ->delete();

        $token = Str::random(40);
        PasskeyRecoveryToken::createForUser($user, $token);

        $url = route('passkey.recover.setup', ['token' => $token]);

        try {
            Mail::to($user->email)->send(new PasskeyRecovery($user, $url));
        } catch (Throwable $e) {
            // Log but do not re-throw — a mail failure must not reveal whether the account exists,
            // and the token is in the DB so the user can request a new one.
            Log::error('Failed to send passkey recovery email', [
                'user_id' => $user->id,
                'exception' => $e->getMessage(),
            ]);
        }
    }

    private function sendTombstoneRecovery(Tombstone $tombstone): void
    {
        TombstoneRecoveryToken::where('tombstone_id', $tombstone->id)
            ->whereNull('used_at')
            ->delete();

        $token = Str::random(40);
        TombstoneRecoveryToken::createForTombstone($tombstone, $token);

        $url = route('passkey.recover.setup', ['token' => $token]);

        try {
            Mail::to($tombstone->email)->send(new TombstoneRecovery($tombstone, $url));
        } catch (Throwable $e) {
            Log::error('Failed to send tombstone recovery email', [
                'tombstone_id' => $tombstone->id,
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --compact --filter="PasskeyRecoveryTombstoneTest|PasskeyRecoveryTest"`
Expected: PASS for both (the pre-existing `PasskeyRecoveryTest.php` must still pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Auth/PasskeyRecoveryController.php tests/Feature/Auth/PasskeyRecoveryTombstoneTest.php
git commit -m "🎇 Add tombstone branch to the passkey recovery flow"
```

---

### Task 13: Full-suite regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend test suite**

Run: `php artisan test --compact`
Expected: all tests pass, including every file touched above plus the pre-existing suite (`PasskeyAuthTest`, `PasskeyRecoveryTest`, `PasskeySettingsTest`, `PasskeyEnforcementTest`, etc.).

- [ ] **Step 2: Run Pint**

Run: `vendor/bin/pint --format agent`
Expected: no style violations remain (or auto-fixed).

- [ ] **Step 3: Run Larastan**

Run: `vendor/bin/phpstan analyse` (or the project's configured Larastan command — check `composer.json` scripts if this differs)
Expected: no new static-analysis errors introduced by tombstoning code.

- [ ] **Step 4: Run frontend build and lint**

Run: `npm run build && npm run lint` (check `package.json` for exact script names if these differ)
Expected: no errors.

- [ ] **Step 5: Commit any Pint/lint auto-fixes**

```bash
git add -A
git commit -m "🧵 Pint/lint fixes for tombstones feature"
```

(Skip this commit if there's nothing to fix.)

---

## Deployment Note

Per the design spec, this PR should merge **after or alongside** the `autopelago` ansible PR that adds `scheduler: true` support (already merged per commit `56268dd`). Confirm the scheduler container is running in staging/production before or shortly after this merges — otherwise `accounts:warn-inactive` and `accounts:tombstone-inactive` are registered but never invoked.
