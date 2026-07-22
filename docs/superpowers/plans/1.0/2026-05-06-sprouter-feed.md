# Sprouter Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen, auto-advancing social media reader that displays posts from Mastodon and Bluesky home timelines with kinetic typography animations.

**Architecture:** Laravel proxies OAuth and API calls to Mastodon (dynamic client registration) and Bluesky (app passwords), normalises posts to a unified format, and serves them to a single Inertia/React page. GSAP + SplitText drives all animations: four randomised word-building templates within posts, zoom-through transitions between them.

**Tech Stack:** Laravel 13, Pest, Inertia v3, React 19, TypeScript, GSAP + SplitText + @gsap/react, Tailwind 4, Vitest + @testing-library/react

---

> **Natural checkpoint:** Tasks 1–9 build the auth and account-connection layer (fully testable in isolation). Tasks 10–19 build the feed and animation layer on top of that.

---

## File Map

**New backend files:**
- `database/migrations/..._create_social_accounts_table.php`
- `app/Models/SocialAccount.php`
- `app/Services/Mastodon/MastodonOAuthService.php`
- `app/Services/Mastodon/MastodonFeedService.php`
- `app/Services/Bluesky/BlueskyAuthService.php`
- `app/Services/Bluesky/BlueskyFeedService.php`
- `app/Services/Feed/PostNormalizer.php`
- `app/Services/Feed/FeedAggregator.php`
- `app/Http/Controllers/Social/MastodonController.php`
- `app/Http/Controllers/Social/BlueskyController.php`
- `app/Http/Controllers/FeedController.php`
- `tests/Feature/Social/MastodonOAuthTest.php`
- `tests/Feature/Social/BlueskyAuthTest.php`
- `tests/Unit/Feed/PostNormalizerTest.php`
- `tests/Feature/Feed/FeedControllerTest.php`

**Modified backend files:**
- `app/Models/User.php` — add `socialAccounts()` relation
- `routes/web.php` — add feed route
- `routes/settings.php` — add connections route

**New frontend files:**
- `resources/js/types/post.ts`
- `resources/js/hooks/useFeedQueue.ts`
- `resources/js/hooks/useAutoAdvance.ts`
- `resources/js/lib/animations/types.ts`
- `resources/js/lib/animations/templates/blockTilt.ts`
- `resources/js/lib/animations/templates/spiral.ts`
- `resources/js/lib/animations/templates/stackFlip.ts`
- `resources/js/lib/animations/templates/arc.ts`
- `resources/js/lib/animations/index.ts`
- `resources/js/components/feed/MediaBackground.tsx`
- `resources/js/components/feed/SourceBadge.tsx`
- `resources/js/components/feed/Attribution.tsx`
- `resources/js/components/feed/ProgressBar.tsx`
- `resources/js/components/feed/PostAnimator.tsx`
- `resources/js/components/feed/PostCard.tsx`
- `resources/js/pages/feed.tsx`
- `resources/js/pages/settings/connections.tsx`
- `resources/js/test/setup.ts`

---

### Task 1: Feature branch + dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feature/sprouter-feed
```

- [ ] **Step 2: Install JS dependencies**

```bash
npm install gsap @gsap/react
npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Add vitest config to vite.config.ts**

Open `vite.config.ts`. Add a `test` block:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import laravel from 'laravel-vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import wayfinder from '@laravel/vite-plugin-wayfinder';

export default defineConfig({
    plugins: [
        laravel({ input: ['resources/js/app.tsx'], refresh: true }),
        react({ babel: { plugins: ['babel-plugin-react-compiler'] } }),
        tailwindcss(),
        wayfinder(),
    ],
    test: {
        environment: 'jsdom',
        setupFiles: ['resources/js/test/setup.ts'],
        globals: true,
    },
    resolve: {
        alias: { '@': '/resources/js' },
    },
});
```

- [ ] **Step 4: Create test setup file**

```ts
// resources/js/test/setup.ts
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Add test script to package.json**

In the `scripts` block, add:
```json
"test": "vitest"
```

- [ ] **Step 6: Verify vitest runs**

```bash
npm test -- --run
```
Expected: `No test files found` (or existing tests pass — no failures).

- [ ] **Step 7: Commit**

```bash
git add vite.config.ts package.json package-lock.json resources/js/test/setup.ts
git commit -m "⚙️ Add GSAP and Vitest dependencies"
```

---

### Task 2: social_accounts migration and model

**Files:**
- Create: `database/migrations/2026_05_06_000001_create_social_accounts_table.php`
- Create: `app/Models/SocialAccount.php`
- Modify: `app/Models/User.php`

- [ ] **Step 1: Generate migration**

```bash
php artisan make:migration create_social_accounts_table
```

- [ ] **Step 2: Fill the migration**

```php
// database/migrations/2026_05_06_000001_create_social_accounts_table.php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('social_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('provider', ['mastodon', 'bluesky']);
            $table->string('instance_url')->nullable();
            $table->text('access_token');
            $table->text('token_secret')->nullable();
            $table->string('handle');
            $table->timestamps();

            $table->unique(['user_id', 'provider']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('social_accounts');
    }
};
```

- [ ] **Step 3: Run migration**

```bash
php artisan migrate
```
Expected: `social_accounts` table created.

- [ ] **Step 4: Create SocialAccount model**

```php
// app/Models/SocialAccount.php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SocialAccount extends Model
{
    protected $fillable = [
        'user_id', 'provider', 'instance_url',
        'access_token', 'token_secret', 'handle',
    ];

    protected $casts = [
        'access_token' => 'encrypted',
        'token_secret' => 'encrypted',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Step 5: Add relation to User model**

Add to `app/Models/User.php` (after the `casts()` method):

```php
use Illuminate\Database\Eloquent\Relations\HasMany;

public function socialAccounts(): HasMany
{
    return $this->hasMany(SocialAccount::class);
}
```

Also add the import at the top of the file with the other `use` statements.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/ app/Models/SocialAccount.php app/Models/User.php
git commit -m "🎇 Add social_accounts table and model"
```

---

### Task 3: TypeScript post types

**Files:**
- Create: `resources/js/types/post.ts`

- [ ] **Step 1: Create the types file**

```ts
// resources/js/types/post.ts
export interface MediaAttachment {
    type: 'image' | 'video';
    url: string;
    preview_url: string;
    alt_text: string | null;
}

export interface Post {
    id: string;
    source: 'mastodon' | 'bluesky';
    author_name: string;
    author_handle: string;
    author_avatar: string;
    body: string;
    media: MediaAttachment[];
    created_at: string;
    original_url: string;
}

export interface FeedResponse {
    posts: Post[];
    next_cursor: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add resources/js/types/post.ts
git commit -m "🎇 Add TypeScript post types"
```

---

### Task 4: Mastodon OAuth service

**Files:**
- Create: `app/Services/Mastodon/MastodonOAuthService.php`
- Create: `tests/Feature/Social/MastodonOAuthTest.php`

- [ ] **Step 1: Write failing tests**

```php
// tests/Feature/Social/MastodonOAuthTest.php
<?php

use App\Models\User;
use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Support\Facades\Http;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('registers a dynamic client and returns an authorize url', function () {
    Http::fake([
        'fosstodon.org/api/v1/apps' => Http::response([
            'client_id' => 'fake-client-id',
            'client_secret' => 'fake-client-secret',
        ]),
    ]);

    $service = new MastodonOAuthService();
    $url = $service->getAuthorizeUrl('https://fosstodon.org', 'https://sprouter.test/auth/mastodon/callback');

    expect($url)->toContain('fosstodon.org/oauth/authorize')
        ->and($url)->toContain('fake-client-id')
        ->and($url)->toContain('code');
});

it('exchanges a code for an access token', function () {
    Http::fake([
        'fosstodon.org/oauth/token' => Http::response([
            'access_token' => 'user-token-abc',
        ]),
        'fosstodon.org/api/v1/accounts/verify_credentials' => Http::response([
            'acct' => 'testuser',
        ]),
    ]);

    $service = new MastodonOAuthService();
    $result = $service->exchangeCode(
        instance: 'https://fosstodon.org',
        code: 'auth-code',
        clientId: 'fake-client-id',
        clientSecret: 'fake-client-secret',
        redirectUri: 'https://sprouter.test/auth/mastodon/callback',
    );

    expect($result['access_token'])->toBe('user-token-abc')
        ->and($result['handle'])->toBe('@testuser@fosstodon.org');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
php artisan test tests/Feature/Social/MastodonOAuthTest.php
```
Expected: `FAILED` — class not found.

- [ ] **Step 3: Create the service**

```php
// app/Services/Mastodon/MastodonOAuthService.php
<?php

namespace App\Services\Mastodon;

use Illuminate\Support\Facades\Http;

class MastodonOAuthService
{
    private const SCOPES = 'read:statuses read:accounts read:follows';

    public function getAuthorizeUrl(string $instance, string $redirectUri): string
    {
        $response = Http::post("{$instance}/api/v1/apps", [
            'client_name' => 'Sprouter',
            'redirect_uris' => $redirectUri,
            'scopes' => self::SCOPES,
            'website' => config('app.url'),
        ])->throw()->json();

        session([
            "mastodon_client_id_{$instance}" => $response['client_id'],
            "mastodon_client_secret_{$instance}" => $response['client_secret'],
        ]);

        return "{$instance}/oauth/authorize?" . http_build_query([
            'client_id' => $response['client_id'],
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => self::SCOPES,
        ]);
    }

    public function exchangeCode(
        string $instance,
        string $code,
        string $clientId,
        string $clientSecret,
        string $redirectUri,
    ): array {
        $tokenResponse = Http::post("{$instance}/oauth/token", [
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'redirect_uri' => $redirectUri,
            'grant_type' => 'authorization_code',
            'code' => $code,
            'scope' => self::SCOPES,
        ])->throw()->json();

        $accountResponse = Http::withToken($tokenResponse['access_token'])
            ->get("{$instance}/api/v1/accounts/verify_credentials")
            ->throw()->json();

        $host = parse_url($instance, PHP_URL_HOST);

        return [
            'access_token' => $tokenResponse['access_token'],
            'handle' => "@{$accountResponse['acct']}@{$host}",
        ];
    }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
php artisan test tests/Feature/Social/MastodonOAuthTest.php
```
Expected: `PASSED` (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Mastodon/MastodonOAuthService.php tests/Feature/Social/MastodonOAuthTest.php
git commit -m "🎇 Add MastodonOAuthService with dynamic client registration"
```

---

### Task 5: Bluesky auth service

**Files:**
- Create: `app/Services/Bluesky/BlueskyAuthService.php`
- Create: `tests/Feature/Social/BlueskyAuthTest.php`

- [ ] **Step 1: Write failing tests**

```php
// tests/Feature/Social/BlueskyAuthTest.php
<?php

use App\Services\Bluesky\BlueskyAuthService;
use Illuminate\Support\Facades\Http;

it('creates a session with an app password', function () {
    Http::fake([
        'bsky.social/xrpc/com.atproto.server.createSession' => Http::response([
            'accessJwt' => 'access-jwt-token',
            'refreshJwt' => 'refresh-jwt-token',
            'handle' => 'alice.bsky.social',
            'did' => 'did:plc:abc123',
        ]),
    ]);

    $service = new BlueskyAuthService();
    $result = $service->createSession('alice.bsky.social', 'app-password-here');

    expect($result['access_token'])->toBe('access-jwt-token')
        ->and($result['refresh_token'])->toBe('refresh-jwt-token')
        ->and($result['handle'])->toBe('@alice.bsky.social');
});

it('throws on invalid credentials', function () {
    Http::fake([
        'bsky.social/xrpc/com.atproto.server.createSession' => Http::response(
            ['error' => 'AuthenticationRequired'],
            401
        ),
    ]);

    $service = new BlueskyAuthService();

    expect(fn () => $service->createSession('bad@bsky.social', 'wrong'))
        ->toThrow(\Illuminate\Http\Client\RequestException::class);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
php artisan test tests/Feature/Social/BlueskyAuthTest.php
```
Expected: `FAILED` — class not found.

- [ ] **Step 3: Create the service**

```php
// app/Services/Bluesky/BlueskyAuthService.php
<?php

namespace App\Services\Bluesky;

use Illuminate\Support\Facades\Http;

class BlueskyAuthService
{
    private const BASE = 'https://bsky.social/xrpc';

    public function createSession(string $identifier, string $appPassword): array
    {
        $response = Http::post(self::BASE . '/com.atproto.server.createSession', [
            'identifier' => $identifier,
            'password' => $appPassword,
        ])->throw()->json();

        return [
            'access_token' => $response['accessJwt'],
            'refresh_token' => $response['refreshJwt'],
            'handle' => '@' . $response['handle'],
        ];
    }
}
```

- [ ] **Step 4: Run tests**

```bash
php artisan test tests/Feature/Social/BlueskyAuthTest.php
```
Expected: `PASSED` (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Bluesky/BlueskyAuthService.php tests/Feature/Social/BlueskyAuthTest.php
git commit -m "🎇 Add BlueskyAuthService with app password flow"
```

---

### Task 6: Social account controllers and routes

**Files:**
- Create: `app/Http/Controllers/Social/MastodonController.php`
- Create: `app/Http/Controllers/Social/BlueskyController.php`
- Modify: `routes/settings.php`

- [ ] **Step 1: Create MastodonController**

```php
// app/Http/Controllers/Social/MastodonController.php
<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Http\Request;

class MastodonController extends Controller
{
    public function __construct(private MastodonOAuthService $oauth) {}

    public function redirect(Request $request)
    {
        $request->validate(['instance_url' => 'required|url']);

        $instance = rtrim($request->input('instance_url'), '/');
        $redirectUri = route('mastodon.callback');

        session(['mastodon_instance' => $instance]);

        return redirect($this->oauth->getAuthorizeUrl($instance, $redirectUri));
    }

    public function callback(Request $request)
    {
        $request->validate(['code' => 'required|string']);

        $instance = session('mastodon_instance');
        $clientId = session("mastodon_client_id_{$instance}");
        $clientSecret = session("mastodon_client_secret_{$instance}");

        $result = $this->oauth->exchangeCode(
            instance: $instance,
            code: $request->input('code'),
            clientId: $clientId,
            clientSecret: $clientSecret,
            redirectUri: route('mastodon.callback'),
        );

        SocialAccount::updateOrCreate(
            ['user_id' => $request->user()->id, 'provider' => 'mastodon'],
            [
                'instance_url' => $instance,
                'access_token' => $result['access_token'],
                'handle' => $result['handle'],
            ]
        );

        return redirect()->route('connections.edit')
            ->with('status', 'mastodon-connected');
    }

    public function destroy(Request $request)
    {
        $request->user()->socialAccounts()
            ->where('provider', 'mastodon')
            ->delete();

        return redirect()->route('connections.edit')
            ->with('status', 'mastodon-disconnected');
    }
}
```

- [ ] **Step 2: Create BlueskyController**

```php
// app/Http/Controllers/Social/BlueskyController.php
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
        ]);

        $result = $this->auth->createSession(
            $request->input('handle'),
            $request->input('app_password'),
        );

        SocialAccount::updateOrCreate(
            ['user_id' => $request->user()->id, 'provider' => 'bluesky'],
            [
                'access_token' => $result['access_token'],
                'token_secret' => $result['refresh_token'],
                'handle' => $result['handle'],
            ]
        );

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-connected');
    }

    public function destroy(Request $request)
    {
        $request->user()->socialAccounts()
            ->where('provider', 'bluesky')
            ->delete();

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-disconnected');
    }
}
```

- [ ] **Step 3: Add routes to routes/settings.php**

Add inside the `auth` + `verified` middleware group:

```php
use App\Http\Controllers\Social\BlueskyController;
use App\Http\Controllers\Social\MastodonController;
use Inertia\Inertia;

// Connections settings page
Route::get('settings/connections', function () {
    return Inertia::render('settings/connections', [
        'connections' => auth()->user()->socialAccounts()
            ->select('provider', 'handle', 'instance_url')
            ->get(),
    ]);
})->name('connections.edit');

// Mastodon OAuth
Route::post('auth/mastodon', [MastodonController::class, 'redirect'])->name('mastodon.redirect');
Route::get('auth/mastodon/callback', [MastodonController::class, 'callback'])->name('mastodon.callback');
Route::delete('auth/mastodon', [MastodonController::class, 'destroy'])->name('mastodon.destroy');

// Bluesky app password
Route::post('auth/bluesky', [BlueskyController::class, 'store'])->name('bluesky.store');
Route::delete('auth/bluesky', [BlueskyController::class, 'destroy'])->name('bluesky.destroy');
```

- [ ] **Step 4: Commit**

```bash
git add app/Http/Controllers/Social/ routes/settings.php
git commit -m "🎇 Add Mastodon and Bluesky controllers and routes"
```

---

### Task 7: Settings connections page

**Files:**
- Create: `resources/js/pages/settings/connections.tsx`

- [ ] **Step 1: Create the connections page**

```tsx
// resources/js/pages/settings/connections.tsx
import { Head, useForm } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SocialConnection {
    provider: 'mastodon' | 'bluesky';
    handle: string;
    instance_url: string | null;
}

export default function Connections({
    connections,
}: {
    connections: SocialConnection[];
}) {
    const mastodon = connections.find((c) => c.provider === 'mastodon');
    const bluesky = connections.find((c) => c.provider === 'bluesky');

    const mastodonForm = useForm({ instance_url: '' });
    const blueskyForm = useForm({ handle: '', app_password: '' });

    return (
        <AppLayout>
            <Head title="Connected accounts" />
            <div className="space-y-6">
                <Heading title="Connected accounts" description="Connect your Mastodon and Bluesky accounts to populate your feed." />

                {/* Mastodon */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 text-base font-semibold">Mastodon</h3>
                    {mastodon ? (
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Connected as <strong>{mastodon.handle}</strong></p>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                    useForm({}).delete(route('mastodon.destroy'))
                                }
                            >
                                Disconnect
                            </Button>
                        </div>
                    ) : (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                mastodonForm.post(route('mastodon.redirect'));
                            }}
                            className="space-y-4"
                        >
                            <div className="space-y-1">
                                <Label htmlFor="instance_url">Instance URL</Label>
                                <Input
                                    id="instance_url"
                                    placeholder="https://mastodon.social"
                                    value={mastodonForm.data.instance_url}
                                    onChange={(e) =>
                                        mastodonForm.setData('instance_url', e.target.value)
                                    }
                                />
                            </div>
                            <Button type="submit" disabled={mastodonForm.processing}>
                                Connect Mastodon
                            </Button>
                        </form>
                    )}
                </div>

                {/* Bluesky */}
                <div className="rounded-lg border p-6">
                    <h3 className="mb-4 text-base font-semibold">Bluesky</h3>
                    {bluesky ? (
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">Connected as <strong>{bluesky.handle}</strong></p>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() =>
                                    useForm({}).delete(route('bluesky.destroy'))
                                }
                            >
                                Disconnect
                            </Button>
                        </div>
                    ) : (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                blueskyForm.post(route('bluesky.store'));
                            }}
                            className="space-y-4"
                        >
                            <div className="space-y-1">
                                <Label htmlFor="bsky_handle">Handle</Label>
                                <Input
                                    id="bsky_handle"
                                    placeholder="alice.bsky.social"
                                    value={blueskyForm.data.handle}
                                    onChange={(e) =>
                                        blueskyForm.setData('handle', e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="app_password">App Password</Label>
                                <Input
                                    id="app_password"
                                    type="password"
                                    placeholder="xxxx-xxxx-xxxx-xxxx"
                                    value={blueskyForm.data.app_password}
                                    onChange={(e) =>
                                        blueskyForm.setData('app_password', e.target.value)
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Generate one at Settings → Privacy and Security → App Passwords in Bluesky.
                                </p>
                            </div>
                            <Button type="submit" disabled={blueskyForm.processing}>
                                Connect Bluesky
                            </Button>
                        </form>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
```

- [ ] **Step 2: Add Connections link to settings sidebar**

Open the settings sidebar component (find it with `grep -r "settings/profile" resources/js --include="*.tsx" -l`). Add a link for connections alongside profile/security:

```tsx
{ title: 'Connected accounts', href: route('connections.edit'), icon: LinkIcon },
```

Import `LinkIcon` from `lucide-react`.

- [ ] **Step 3: Commit**

```bash
git add resources/js/pages/settings/connections.tsx
git commit -m "🖼️ Add connections settings page"
```

---

### Task 8: Mastodon feed service

**Files:**
- Create: `app/Services/Mastodon/MastodonFeedService.php`

- [ ] **Step 1: Create the service**

```php
// app/Services/Mastodon/MastodonFeedService.php
<?php

namespace App\Services\Mastodon;

use App\Models\SocialAccount;
use Illuminate\Support\Facades\Http;

class MastodonFeedService
{
    public function getHomeTimeline(SocialAccount $account, int $limit = 20, ?string $maxId = null): array
    {
        $params = ['limit' => $limit];
        if ($maxId !== null) {
            $params['max_id'] = $maxId;
        }

        return Http::withToken($account->access_token)
            ->get("{$account->instance_url}/api/v1/timelines/home", $params)
            ->throw()
            ->json();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/Services/Mastodon/MastodonFeedService.php
git commit -m "🎇 Add MastodonFeedService"
```

---

### Task 9: Bluesky feed service

**Files:**
- Create: `app/Services/Bluesky/BlueskyFeedService.php`

- [ ] **Step 1: Create the service**

```php
// app/Services/Bluesky/BlueskyFeedService.php
<?php

namespace App\Services\Bluesky;

use App\Models\SocialAccount;
use Illuminate\Support\Facades\Http;

class BlueskyFeedService
{
    private const BASE = 'https://bsky.social/xrpc';

    public function getHomeTimeline(SocialAccount $account, int $limit = 20, ?string $cursor = null): array
    {
        $params = ['limit' => $limit];
        if ($cursor !== null) {
            $params['cursor'] = $cursor;
        }

        $response = Http::withToken($account->access_token)
            ->get(self::BASE . '/app.bsky.feed.getTimeline', $params)
            ->throw()
            ->json();

        return [
            'posts' => $response['feed'] ?? [],
            'cursor' => $response['cursor'] ?? null,
        ];
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/Services/Bluesky/BlueskyFeedService.php
git commit -m "🎇 Add BlueskyFeedService"
```

---

> **Checkpoint:** Auth layer is complete. Connect accounts via `/settings/connections` before proceeding with feed tasks.

---

### Task 10: Post normalizer

**Files:**
- Create: `app/Services/Feed/PostNormalizer.php`
- Create: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write failing tests**

```php
// tests/Unit/Feed/PostNormalizerTest.php
<?php

use App\Services\Feed\PostNormalizer;

it('normalises a mastodon status to unified post format', function () {
    $status = [
        'id' => '109123456789',
        'content' => '<p>hello <strong>world</strong></p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/109123456789',
        'account' => [
            'display_name' => 'Test User',
            'acct' => 'user',
            'avatar' => 'https://fosstodon.org/avatars/original/user.jpg',
        ],
        'media_attachments' => [
            [
                'type' => 'image',
                'url' => 'https://fosstodon.org/media/img.jpg',
                'preview_url' => 'https://fosstodon.org/media/img_small.jpg',
                'description' => 'A photo',
            ],
        ],
    ];

    $normalizer = new PostNormalizer();
    $post = $normalizer->fromMastodon($status, 'fosstodon.org');

    expect($post['id'])->toBe('mastodon_109123456789')
        ->and($post['source'])->toBe('mastodon')
        ->and($post['body'])->toBe('hello world')
        ->and($post['author_name'])->toBe('Test User')
        ->and($post['author_handle'])->toBe('@user@fosstodon.org')
        ->and($post['media'][0]['type'])->toBe('image')
        ->and($post['media'][0]['alt_text'])->toBe('A photo');
});

it('normalises a bluesky feed view post to unified post format', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => ['text' => 'hello bluesky', 'createdAt' => '2024-01-15T11:00:00.000Z'],
            'author' => [
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/avatar.jpg',
            ],
            'embed' => [
                '$type' => 'app.bsky.embed.images#view',
                'images' => [
                    [
                        'fullsize' => 'https://cdn.bsky.app/img.jpg',
                        'thumb' => 'https://cdn.bsky.app/img_thumb.jpg',
                        'alt' => 'Sky photo',
                    ],
                ],
            ],
        ],
    ];

    $normalizer = new PostNormalizer();
    $post = $normalizer->fromBluesky($feedPost);

    expect($post['id'])->toBe('bluesky_at://did:plc:abc/app.bsky.feed.post/xyz')
        ->and($post['source'])->toBe('bluesky')
        ->and($post['body'])->toBe('hello bluesky')
        ->and($post['author_name'])->toBe('Alice')
        ->and($post['author_handle'])->toBe('@alice.bsky.social')
        ->and($post['media'][0]['type'])->toBe('image')
        ->and($post['media'][0]['alt_text'])->toBe('Sky photo');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
php artisan test tests/Unit/Feed/PostNormalizerTest.php
```
Expected: `FAILED`.

- [ ] **Step 3: Create the normalizer**

```php
// app/Services/Feed/PostNormalizer.php
<?php

namespace App\Services\Feed;

class PostNormalizer
{
    public function fromMastodon(array $status, string $host): array
    {
        return [
            'id' => "mastodon_{$status['id']}",
            'source' => 'mastodon',
            'author_name' => $status['account']['display_name'] ?: $status['account']['acct'],
            'author_handle' => "@{$status['account']['acct']}@{$host}",
            'author_avatar' => $status['account']['avatar'],
            'body' => strip_tags($status['content']),
            'media' => $this->normaliseMastodonMedia($status['media_attachments'] ?? []),
            'created_at' => $status['created_at'],
            'original_url' => $status['url'],
        ];
    }

    public function fromBluesky(array $feedPost): array
    {
        $post = $feedPost['post'];
        $record = $post['record'];
        $author = $post['author'];

        return [
            'id' => "bluesky_{$post['uri']}",
            'source' => 'bluesky',
            'author_name' => $author['displayName'] ?: $author['handle'],
            'author_handle' => '@' . $author['handle'],
            'author_avatar' => $author['avatar'] ?? '',
            'body' => $record['text'],
            'media' => $this->normaliseBlueskyMedia($post['embed'] ?? null),
            'created_at' => $record['createdAt'],
            'original_url' => $this->blueskyPostUrl($author['handle'], $post['uri']),
        ];
    }

    private function normaliseMastodonMedia(array $attachments): array
    {
        return array_values(array_filter(array_map(function ($a) {
            if (!in_array($a['type'], ['image', 'video'])) {
                return null;
            }
            return [
                'type' => $a['type'],
                'url' => $a['url'],
                'preview_url' => $a['preview_url'],
                'alt_text' => $a['description'] ?: null,
            ];
        }, $attachments)));
    }

    private function normaliseBlueskyMedia(?array $embed): array
    {
        if ($embed === null) {
            return [];
        }

        if ($embed['$type'] === 'app.bsky.embed.images#view') {
            return array_map(fn ($img) => [
                'type' => 'image',
                'url' => $img['fullsize'],
                'preview_url' => $img['thumb'],
                'alt_text' => $img['alt'] ?: null,
            ], $embed['images'] ?? []);
        }

        return [];
    }

    private function blueskyPostUrl(string $handle, string $uri): string
    {
        $rkey = basename($uri);
        return "https://bsky.app/profile/{$handle}/post/{$rkey}";
    }
}
```

- [ ] **Step 4: Run tests**

```bash
php artisan test tests/Unit/Feed/PostNormalizerTest.php
```
Expected: `PASSED` (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Add PostNormalizer for Mastodon and Bluesky posts"
```

---

### Task 11: Feed aggregator and controller

**Files:**
- Create: `app/Services/Feed/FeedAggregator.php`
- Create: `app/Http/Controllers/FeedController.php`
- Create: `tests/Feature/Feed/FeedControllerTest.php`
- Modify: `routes/web.php`

- [ ] **Step 1: Create FeedAggregator**

```php
// app/Services/Feed/FeedAggregator.php
<?php

namespace App\Services\Feed;

use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Support\Collection;

class FeedAggregator
{
    public function __construct(
        private MastodonFeedService $mastodon,
        private BlueskyFeedService $bluesky,
        private PostNormalizer $normalizer,
    ) {}

    public function fetch(User $user, int $limit = 20, ?string $cursor = null): array
    {
        $cursors = $cursor ? json_decode(base64_decode($cursor), true) : [];
        $posts = collect();

        foreach ($user->socialAccounts as $account) {
            $accountCursor = $cursors[$account->id] ?? null;

            if ($account->provider === 'mastodon') {
                $host = parse_url($account->instance_url, PHP_URL_HOST);
                $statuses = $this->mastodon->getHomeTimeline($account, $limit, $accountCursor);
                $normalised = array_map(fn ($s) => $this->normalizer->fromMastodon($s, $host), $statuses);
                $nextCursor = !empty($statuses) ? end($statuses)['id'] : null;
                $posts = $posts->concat($normalised);
                if ($nextCursor) {
                    $cursors[$account->id] = $nextCursor;
                }
            }

            if ($account->provider === 'bluesky') {
                $result = $this->bluesky->getHomeTimeline($account, $limit, $accountCursor);
                $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p), $result['posts']);
                $posts = $posts->concat($normalised);
                if ($result['cursor']) {
                    $cursors[$account->id] = $result['cursor'];
                }
            }
        }

        $sorted = $posts->sortByDesc('created_at')->values()->take($limit)->all();
        $nextCursor = !empty($sorted) ? base64_encode(json_encode($cursors)) : null;

        return ['posts' => $sorted, 'next_cursor' => $nextCursor];
    }
}
```

- [ ] **Step 2: Create FeedController**

```php
// app/Http/Controllers/FeedController.php
<?php

namespace App\Http\Controllers;

use App\Services\Feed\FeedAggregator;
use Illuminate\Http\Request;
use Inertia\Inertia;

class FeedController extends Controller
{
    public function __construct(private FeedAggregator $aggregator) {}

    public function index(Request $request)
    {
        $user = $request->user();
        $user->load('socialAccounts');

        $result = $this->aggregator->fetch($user);

        if ($request->wantsJson()) {
            return response()->json($result);
        }

        return Inertia::render('feed', [
            'initialPosts' => $result['posts'],
            'initialCursor' => $result['next_cursor'],
        ]);
    }
}
```

- [ ] **Step 3: Add feed route to routes/web.php**

```php
use App\Http\Controllers\FeedController;

Route::middleware(['auth', 'verified'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
    Route::get('feed', [FeedController::class, 'index'])->name('feed');
});
```

- [ ] **Step 4: Write FeedController test**

```php
// tests/Feature/Feed/FeedControllerTest.php
<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Feed\FeedAggregator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('renders the feed page for authenticated users', function () {
    $user = User::factory()->create();

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetch')->once()->andReturn([
        'posts' => [],
        'next_cursor' => null,
    ]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $response = $this->actingAs($user)->get(route('feed'));

    $response->assertInertia(fn ($page) =>
        $page->component('feed')
             ->has('initialPosts')
             ->has('initialCursor')
    );
});

it('returns json for xhr requests', function () {
    $user = User::factory()->create();

    $mockAggregator = Mockery::mock(FeedAggregator::class);
    $mockAggregator->shouldReceive('fetch')->once()->andReturn([
        'posts' => [],
        'next_cursor' => null,
    ]);
    app()->instance(FeedAggregator::class, $mockAggregator);

    $response = $this->actingAs($user)
        ->getJson(route('feed'));

    $response->assertOk()->assertJsonStructure(['posts', 'next_cursor']);
});

it('redirects guests to login', function () {
    $this->get(route('feed'))->assertRedirect(route('login'));
});
```

- [ ] **Step 5: Run tests**

```bash
php artisan test tests/Feature/Feed/FeedControllerTest.php
```
Expected: `PASSED` (3 tests).

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/FeedAggregator.php app/Http/Controllers/FeedController.php tests/Feature/Feed/ routes/web.php
git commit -m "🎇 Add FeedAggregator and FeedController"
```

---

### Task 12: useFeedQueue hook

**Files:**
- Create: `resources/js/hooks/useFeedQueue.ts`

- [ ] **Step 1: Write failing test**

```ts
// resources/js/hooks/useFeedQueue.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi, it, expect, beforeEach } from 'vitest';
import { useFeedQueue } from './useFeedQueue';
import type { Post } from '@/types/post';
import axios from 'axios';

vi.mock('axios');

const makePost = (id: string): Post => ({
    id,
    source: 'mastodon',
    author_name: 'Test',
    author_handle: '@test@example.com',
    author_avatar: '',
    body: 'hello',
    media: [],
    created_at: new Date().toISOString(),
    original_url: 'https://example.com',
});

it('initialises with provided posts', () => {
    const posts = [makePost('1'), makePost('2')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null })
    );
    expect(result.current.queue).toHaveLength(2);
});

it('dequeues the head of the queue', () => {
    const posts = [makePost('1'), makePost('2'), makePost('3')];
    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: null })
    );
    act(() => result.current.advance());
    expect(result.current.current?.id).toBe('2');
    expect(result.current.queue).toHaveLength(2);
});

it('fetches more posts when queue drops to 5', async () => {
    const posts = Array.from({ length: 6 }, (_, i) => makePost(String(i)));
    const newPosts = [makePost('extra1'), makePost('extra2')];

    vi.mocked(axios.get).mockResolvedValue({
        data: { posts: newPosts, next_cursor: null },
    });

    const { result } = renderHook(() =>
        useFeedQueue({ initialPosts: posts, initialCursor: 'cursor123' })
    );

    await act(async () => result.current.advance());

    expect(axios.get).toHaveBeenCalledWith('/feed', {
        params: { cursor: 'cursor123' },
        headers: { Accept: 'application/json' },
    });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --run hooks/useFeedQueue
```
Expected: `FAILED`.

- [ ] **Step 3: Create the hook**

```ts
// resources/js/hooks/useFeedQueue.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import type { Post, FeedResponse } from '@/types/post';

const REFILL_THRESHOLD = 5;

export function useFeedQueue({
    initialPosts,
    initialCursor,
}: {
    initialPosts: Post[];
    initialCursor: string | null;
}) {
    const [queue, setQueue] = useState<Post[]>(initialPosts.slice(1));
    const [current, setCurrent] = useState<Post | null>(initialPosts[0] ?? null);
    const [cursor, setCursor] = useState<string | null>(initialCursor);
    const fetching = useRef(false);

    const fetchMore = useCallback(async (activeCursor: string) => {
        if (fetching.current) return;
        fetching.current = true;
        try {
            const { data } = await axios.get<FeedResponse>('/feed', {
                params: { cursor: activeCursor },
                headers: { Accept: 'application/json' },
            });
            setQueue((q) => [...q, ...data.posts]);
            setCursor(data.next_cursor);
        } finally {
            fetching.current = false;
        }
    }, []);

    useEffect(() => {
        if (queue.length <= REFILL_THRESHOLD && cursor) {
            fetchMore(cursor);
        }
    }, [queue.length, cursor, fetchMore]);

    const advance = useCallback(() => {
        setQueue((q) => {
            setCurrent(q[0] ?? null);
            return q.slice(1);
        });
    }, []);

    return { current, queue, advance };
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- --run hooks/useFeedQueue
```
Expected: `PASSED` (3 tests).

- [ ] **Step 5: Commit**

```bash
git add resources/js/hooks/useFeedQueue.ts resources/js/hooks/useFeedQueue.test.ts
git commit -m "🎇 Add useFeedQueue hook with auto-refill"
```

---

### Task 13: useAutoAdvance hook

**Files:**
- Create: `resources/js/hooks/useAutoAdvance.ts`

- [ ] **Step 1: Write failing test**

```ts
// resources/js/hooks/useAutoAdvance.test.ts
import { renderHook, act } from '@testing-library/react';
import { vi, it, expect, beforeEach, afterEach } from 'vitest';
import { useAutoAdvance } from './useAutoAdvance';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('calls onAdvance after the duration', () => {
    const onAdvance = vi.fn();
    renderHook(() => useAutoAdvance({ duration: 8000, paused: false, onAdvance }));
    act(() => vi.advanceTimersByTime(8000));
    expect(onAdvance).toHaveBeenCalledOnce();
});

it('does not advance while paused', () => {
    const onAdvance = vi.fn();
    renderHook(() => useAutoAdvance({ duration: 8000, paused: true, onAdvance }));
    act(() => vi.advanceTimersByTime(10000));
    expect(onAdvance).not.toHaveBeenCalled();
});

it('returns progress from 1 to 0', () => {
    const onAdvance = vi.fn();
    const { result } = renderHook(() =>
        useAutoAdvance({ duration: 8000, paused: false, onAdvance })
    );
    expect(result.current.progress).toBe(1);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.progress).toBeCloseTo(0.5, 1);
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm test -- --run hooks/useAutoAdvance
```
Expected: `FAILED`.

- [ ] **Step 3: Create the hook**

```ts
// resources/js/hooks/useAutoAdvance.ts
import { useState, useEffect, useRef, useCallback } from 'react';

export function useAutoAdvance({
    duration,
    paused,
    onAdvance,
}: {
    duration: number;
    paused: boolean;
    onAdvance: () => void;
}) {
    const [progress, setProgress] = useState(1);
    const startRef = useRef<number | null>(null);
    const rafRef = useRef<number | null>(null);
    const pausedRef = useRef(paused);
    pausedRef.current = paused;

    const reset = useCallback(() => {
        setProgress(1);
        startRef.current = null;
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
        }
    }, []);

    useEffect(() => {
        reset();

        if (paused) return;

        const tick = (timestamp: number) => {
            if (pausedRef.current) {
                startRef.current = null;
                rafRef.current = requestAnimationFrame(tick);
                return;
            }

            if (startRef.current === null) {
                startRef.current = timestamp;
            }

            const elapsed = timestamp - startRef.current;
            const remaining = Math.max(0, 1 - elapsed / duration);
            setProgress(remaining);

            if (elapsed >= duration) {
                onAdvance();
                return;
            }

            rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        };
    // onAdvance and reset are stable refs; paused and duration are the real deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paused, duration]);

    return { progress, reset };
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- --run hooks/useAutoAdvance
```
Expected: `PASSED` (3 tests).

- [ ] **Step 5: Commit**

```bash
git add resources/js/hooks/useAutoAdvance.ts resources/js/hooks/useAutoAdvance.test.ts
git commit -m "🎇 Add useAutoAdvance hook with progress tracking"
```

---

### Task 14: Layout components

**Files:**
- Create: `resources/js/components/feed/MediaBackground.tsx`
- Create: `resources/js/components/feed/SourceBadge.tsx`
- Create: `resources/js/components/feed/Attribution.tsx`
- Create: `resources/js/components/feed/ProgressBar.tsx`

- [ ] **Step 1: Create MediaBackground**

```tsx
// resources/js/components/feed/MediaBackground.tsx
import type { MediaAttachment } from '@/types/post';

export function MediaBackground({ media }: { media: MediaAttachment[] }) {
    const first = media[0];
    if (!first) return null;

    const src = first.type === 'video' ? first.preview_url : first.url;

    return (
        <div className="pointer-events-none absolute inset-0 z-0">
            <img
                src={src}
                alt=""
                className="h-full w-full object-cover"
                style={{ opacity: 0.4 }}
            />
        </div>
    );
}
```

- [ ] **Step 2: Create SourceBadge**

```tsx
// resources/js/components/feed/SourceBadge.tsx
import type { Post } from '@/types/post';

const COLORS = {
    mastodon: '#6364ff',
    bluesky: '#0085ff',
} as const;

export function SourceBadge({ post }: { post: Post }) {
    const label =
        post.source === 'mastodon'
            ? post.author_handle.split('@').pop() ?? 'mastodon'
            : 'bsky.app';

    return (
        <div className="flex items-center gap-1.5 self-start rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/60">
            <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: COLORS[post.source] }}
            />
            {label}
        </div>
    );
}
```

- [ ] **Step 3: Create Attribution**

```tsx
// resources/js/components/feed/Attribution.tsx
import type { Post } from '@/types/post';

export function Attribution({ post }: { post: Post }) {
    return (
        <a
            href={post.original_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
            <img
                src={post.author_avatar}
                alt={post.author_name}
                className="h-7 w-7 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">{post.author_name}</p>
                <p className="truncate text-[0.65rem] text-white/50">{post.author_handle} · tap to open ↗</p>
            </div>
        </a>
    );
}
```

- [ ] **Step 4: Create ProgressBar**

```tsx
// resources/js/components/feed/ProgressBar.tsx
export function ProgressBar({ progress }: { progress: number }) {
    return (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
            <div
                className="h-full bg-white/60"
                style={{ width: `${progress * 100}%`, transition: 'width 0.1s linear' }}
            />
        </div>
    );
}
```

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/feed/
git commit -m "🖼️ Add feed layout components"
```

---

### Task 15: GSAP animation templates

**Files:**
- Create: `resources/js/lib/animations/types.ts`
- Create: `resources/js/lib/animations/templates/blockTilt.ts`
- Create: `resources/js/lib/animations/templates/spiral.ts`
- Create: `resources/js/lib/animations/templates/stackFlip.ts`
- Create: `resources/js/lib/animations/templates/arc.ts`
- Create: `resources/js/lib/animations/index.ts`

- [ ] **Step 1: Create the template type**

```ts
// resources/js/lib/animations/types.ts
export type AnimationTemplate = (
    tl: gsap.core.Timeline,
    words: Element[],
    container: Element,
) => void;
```

- [ ] **Step 2: Create blockTilt template**

```ts
// resources/js/lib/animations/templates/blockTilt.ts
import type { AnimationTemplate } from '../types';

export const blockTilt: AnimationTemplate = (tl, words, container) => {
    tl.set(words, { opacity: 0, y: -16, scale: 0.8 })
      .to(words, {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.25,
          ease: 'power2.out',
          stagger: 0.12,
      })
      .to(container, {
          rotation: 6,
          duration: 0.8,
          ease: 'back.out(1.4)',
      });
};
```

- [ ] **Step 3: Create spiral template**

```ts
// resources/js/lib/animations/templates/spiral.ts
import { gsap } from 'gsap';
import type { AnimationTemplate } from '../types';

export const spiral: AnimationTemplate = (tl, words) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const origins = [
        { x: -vw * 0.5, y: -vh * 0.4 },
        { x: vw * 0.5, y: -vh * 0.4 },
        { x: -vw * 0.5, y: vh * 0.4 },
        { x: vw * 0.5, y: vh * 0.4 },
        { x: 0, y: -vh * 0.5 },
        { x: 0, y: vh * 0.5 },
    ];

    words.forEach((word, i) => {
        const origin = origins[i % origins.length];
        tl.set(word, { opacity: 0, x: origin.x, y: origin.y, scale: 0.3 }, 0)
          .to(word, {
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              duration: 0.4,
              ease: 'power3.out',
          }, i * 0.15);
    });
};
```

- [ ] **Step 4: Create stackFlip template**

```ts
// resources/js/lib/animations/templates/stackFlip.ts
import type { AnimationTemplate } from '../types';

export const stackFlip: AnimationTemplate = (tl, words, container) => {
    tl.set(words, { opacity: 0, x: -24 })
      .to(words, {
          opacity: 1,
          x: 0,
          duration: 0.3,
          ease: 'power2.out',
          stagger: 0.18,
      })
      .to(container, {
          rotationY: 360,
          duration: 1.0,
          ease: 'power2.inOut',
          transformOrigin: '50% 50%',
      });
};
```

- [ ] **Step 5: Create arc template**

```ts
// resources/js/lib/animations/templates/arc.ts
import type { AnimationTemplate } from '../types';

export const arc: AnimationTemplate = (tl, words) => {
    const longest = [...words].reduce((a, b) =>
        (a.textContent?.length ?? 0) >= (b.textContent?.length ?? 0) ? a : b
    );
    const others = words.filter((w) => w !== longest);

    // Others fly in from surrounding positions
    others.forEach((word, i) => {
        const angle = (i / others.length) * Math.PI * 2;
        const dx = Math.cos(angle) * 120;
        const dy = Math.sin(angle) * 80;
        tl.set(word, { opacity: 0, x: dx, y: dy, scale: 0.5 }, 0)
          .to(word, {
              opacity: 1,
              x: 0,
              y: 0,
              scale: 1,
              duration: 0.35,
              ease: 'power2.out',
          }, i * 0.1);
    });

    // Longest word crashes in last
    tl.set(longest, { opacity: 0, scale: 2.5, filter: 'blur(8px)' }, 0)
      .to(
          longest,
          {
              opacity: 1,
              scale: 1,
              filter: 'blur(0px)',
              duration: 0.5,
              ease: 'power3.out',
          },
          others.length * 0.1 + 0.15,
      );
};
```

- [ ] **Step 6: Create the template registry**

```ts
// resources/js/lib/animations/index.ts
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { blockTilt } from './templates/blockTilt';
import { spiral } from './templates/spiral';
import { stackFlip } from './templates/stackFlip';
import { arc } from './templates/arc';
import type { AnimationTemplate } from './types';

gsap.registerPlugin(SplitText);

export const templates: AnimationTemplate[] = [blockTilt, spiral, stackFlip, arc];

export function pickTemplate(exclude?: AnimationTemplate): AnimationTemplate {
    const candidates = exclude
        ? templates.filter((t) => t !== exclude)
        : templates;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

export { SplitText };
export type { AnimationTemplate };
```

- [ ] **Step 7: Commit**

```bash
git add resources/js/lib/animations/
git commit -m "🎇 Add four GSAP kinetic typography animation templates"
```

---

### Task 16: PostAnimator component

**Files:**
- Create: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Create PostAnimator**

```tsx
// resources/js/components/feed/PostAnimator.tsx
import { useRef, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { SplitText, pickTemplate } from '@/lib/animations';
import type { AnimationTemplate } from '@/lib/animations/types';
import type { Post } from '@/types/post';

gsap.registerPlugin(SplitText);

const lastTemplate = { current: undefined as AnimationTemplate | undefined };

export function PostAnimator({ post }: { post: Post }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    useGSAP(() => {
        const container = containerRef.current;
        const textEl = textRef.current;
        if (!container || !textEl) return;

        const split = new SplitText(textEl, { type: 'words' });
        const template = pickTemplate(lastTemplate.current);
        lastTemplate.current = template;

        const tl = gsap.timeline();
        template(tl, split.words as Element[], container);

        return () => {
            split.revert();
            tl.kill();
        };
    }, [post.id]);

    return (
        <div
            ref={containerRef}
            className="flex h-full w-full items-center justify-center p-8 text-center"
        >
            <div
                ref={textRef}
                className="text-2xl font-extrabold leading-tight tracking-tight text-white"
            >
                {post.body}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx
git commit -m "🎇 Add PostAnimator with GSAP SplitText and random templates"
```

---

### Task 17: PostCard component

**Files:**
- Create: `resources/js/components/feed/PostCard.tsx`

- [ ] **Step 1: Create PostCard**

```tsx
// resources/js/components/feed/PostCard.tsx
import type { Post } from '@/types/post';
import { MediaBackground } from './MediaBackground';
import { SourceBadge } from './SourceBadge';
import { PostAnimator } from './PostAnimator';
import { Attribution } from './Attribution';
import { ProgressBar } from './ProgressBar';

export function PostCard({
    post,
    progress,
    paused,
    onTogglePause,
}: {
    post: Post;
    progress: number;
    paused: boolean;
    onTogglePause: () => void;
}) {
    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
            <MediaBackground media={post.media} />

            <div className="relative z-10 flex flex-1 flex-col p-4">
                <SourceBadge post={post} />
                <div className="flex flex-1 items-center justify-center">
                    <PostAnimator post={post} />
                </div>
            </div>

            <div className="relative z-10 flex items-center gap-2 px-4 pb-3 pt-2">
                <Attribution post={post} />
                <button
                    onClick={onTogglePause}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg leading-none"
                    aria-label={paused ? 'Resume' : 'Pause'}
                >
                    {paused ? '▶️' : '⏸'}
                </button>
            </div>

            <ProgressBar progress={progress} />
        </div>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add resources/js/components/feed/PostCard.tsx
git commit -m "🖼️ Add PostCard component assembling feed layout"
```

---

### Task 18: Feed page with zoom-through transition

**Files:**
- Create: `resources/js/pages/feed.tsx`

- [ ] **Step 1: Create the feed page**

```tsx
// resources/js/pages/feed.tsx
import { useState, useRef, useCallback } from 'react';
import { Head } from '@inertiajs/react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useFeedQueue } from '@/hooks/useFeedQueue';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { PostCard } from '@/components/feed/PostCard';
import type { Post } from '@/types/post';

export default function Feed({
    initialPosts,
    initialCursor,
}: {
    initialPosts: Post[];
    initialCursor: string | null;
}) {
    const { current, advance } = useFeedQueue({ initialPosts, initialCursor });
    const [paused, setPaused] = useState(false);
    const currentRef = useRef<HTMLDivElement>(null);
    const nextRef = useRef<HTMLDivElement>(null);
    const transitioningRef = useRef(false);

    const handleAdvance = useCallback(() => {
        if (transitioningRef.current || !currentRef.current) return;
        transitioningRef.current = true;

        const tl = gsap.timeline({
            onComplete: () => {
                advance();
                transitioningRef.current = false;
                gsap.set(currentRef.current!, { scale: 1, filter: 'blur(0px)', opacity: 1 });
            },
        });

        tl.to(currentRef.current, {
            scale: 1.3,
            filter: 'blur(8px)',
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
        }).fromTo(
            currentRef.current,
            { scale: 0.7, filter: 'blur(8px)', opacity: 0 },
            { scale: 1, filter: 'blur(0px)', opacity: 1, duration: 0.3, ease: 'power2.out' },
        );
    }, [advance]);

    const { progress } = useAutoAdvance({
        duration: 8000,
        paused,
        onAdvance: handleAdvance,
    });

    if (!current) {
        return (
            <div className="flex h-screen items-center justify-center bg-black text-white">
                <p className="text-sm opacity-50">No posts — connect an account in Settings.</p>
            </div>
        );
    }

    return (
        <>
            <Head title="Feed" />
            <div className="h-screen w-screen overflow-hidden bg-black">
                <div ref={currentRef} className="h-full w-full">
                    <PostCard
                        post={current}
                        progress={progress}
                        paused={paused}
                        onTogglePause={() => setPaused((p) => !p)}
                    />
                </div>
            </div>
        </>
    );
}
```

- [ ] **Step 2: Commit**

```bash
git add resources/js/pages/feed.tsx
git commit -m "🎇 Add Feed page with GSAP zoom-through transitions"
```

---

### Task 19: Wire up navigation

**Files:**
- Modify: `resources/js/pages/dashboard.tsx`

- [ ] **Step 1: Add feed link to dashboard**

Open `resources/js/pages/dashboard.tsx`. Replace or augment the dashboard content to include a prominent link to the feed:

```tsx
import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { feed } from '@/routes';

export default function Dashboard() {
    return (
        <AppLayout>
            <Head title="Dashboard" />
            <div className="flex flex-col items-center justify-center gap-6 py-16">
                <Link
                    href={feed()}
                    className="rounded-lg bg-black px-8 py-4 text-lg font-bold text-white transition hover:bg-gray-900"
                >
                    Open Feed →
                </Link>
                <Link href={route('connections.edit')} className="text-sm text-muted-foreground underline">
                    Manage connected accounts
                </Link>
            </div>
        </AppLayout>
    );
}
```

Note: `feed()` from `@/routes` becomes available after `php artisan wayfinder:generate` which runs automatically during `npm run dev`.

- [ ] **Step 2: Run the dev server and verify the full flow**

```bash
php artisan serve &
npm run dev
```

1. Register an account at `http://localhost:8000/register`
2. Visit `/settings/connections` and connect a Mastodon or Bluesky account
3. Visit `/feed` — posts should appear, animate, and auto-advance

- [ ] **Step 3: Run all tests**

```bash
php artisan test
npm test -- --run
```
Expected: all pass.

- [ ] **Step 4: Final commit**

```bash
git add resources/js/pages/dashboard.tsx
git commit -m "🖼️ Wire up Feed link on dashboard"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Mastodon OAuth with dynamic client registration — Task 4, 6
- ✅ Bluesky app passwords — Task 5, 6
- ✅ social_accounts table — Task 2
- ✅ Unified post format — Task 3, 10
- ✅ Feed aggregation, merge + sort — Task 11
- ✅ Initial 20 posts via Inertia props — Task 11
- ✅ Refill at 5 remaining via `/feed?cursor=` — Task 12
- ✅ Auto-advance 8s — Task 13
- ✅ Pause/play button bottom-right — Task 17
- ✅ Progress bar — Task 14, 17
- ✅ Four GSAP templates — Task 15
- ✅ Random template, no consecutive repeats — Task 15
- ✅ SplitText word-level animation — Task 16
- ✅ Zoom-through between-post transition — Task 18
- ✅ Media as dimmed background — Task 14
- ✅ Attribution tap → open original — Task 14
- ✅ Source badge — Task 14
- ✅ Empty state (no accounts connected) — Task 18

**No placeholders detected.**

**Type consistency verified:** `Post`, `MediaAttachment`, `FeedResponse` defined in Task 3 and used consistently through Tasks 12–18. `AnimationTemplate` defined in Task 15 and used in Task 16.
