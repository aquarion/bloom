# Passkey Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WebAuthn/passkey support with usernameless conditional UI on the login page, multi-passkey management in security settings, optional post-registration setup, and security email notifications.

**Architecture:** `web-auth/webauthn-lib` handles all CBOR/COSE crypto; `WebAuthnService` wraps it so controllers stay thin. Two controllers: `PasskeyAuthController` (login ceremony, guest routes) and `PasskeyController` (settings CRUD, auth routes). Login page starts a silent conditional WebAuthn request on mount so passkeys surface in the browser autofill; an explicit button also triggers auth. Tests mock `WebAuthnService` for verification endpoints.

**Tech Stack:** PHP 8.4, Laravel 13 + Fortify, `web-auth/webauthn-lib ^5.3`, React 18 + TypeScript, Inertia.js v3, Laravel Wayfinder

---

## File Map

### New Files

| File | Purpose |
|---|---|
| `database/migrations/2026_05_25_000001_create_passkeys_table.php` | Passkeys schema |
| `app/Models/Passkey.php` | Passkey Eloquent model |
| `app/Services/WebAuthn/WebAuthnService.php` | Options generation + response verification |
| `app/Http/Controllers/Auth/PasskeyAuthController.php` | Login ceremony (options + authenticate) |
| `app/Http/Controllers/Settings/PasskeyController.php` | Passkey CRUD in settings |
| `app/Http/Responses/RegisteredWithPasskeyResponse.php` | Post-registration redirect to setup page |
| `app/Mail/PasskeyInvalidated.php` | Mailable for passkey removal |
| `resources/views/mail/passkey-invalidated.blade.php` | Email template |
| `resources/js/hooks/use-passkey.ts` | Browser WebAuthn API wrapper |
| `resources/js/pages/auth/passkey-setup.tsx` | Optional post-registration passkey setup |
| `resources/js/components/passkey-list.tsx` | Passkey list + delete UI for settings |
| `tests/Feature/Auth/PasskeyAuthTest.php` | Login ceremony tests |
| `tests/Feature/Settings/PasskeySettingsTest.php` | Settings CRUD tests |
| `tests/Unit/Services/WebAuthnServiceTest.php` | Options generation unit tests |

### Modified Files

| File | Change |
|---|---|
| `app/Models/User.php` | Add `passkeys()` relationship |
| `routes/web.php` | Add passkey auth routes |
| `routes/settings.php` | Add passkey management + setup routes |
| `resources/js/pages/auth/login.tsx` | Conditional UI + explicit button |
| `resources/js/pages/settings/security.tsx` | Passkeys section |
| `app/Providers/FortifyServiceProvider.php` | Override `RegisteredUserResponse` to redirect to setup |

---

## Task 1: Foundation — install library, migration, Passkey model, User relationship

**Files:**
- Create: `database/migrations/2026_05_25_000001_create_passkeys_table.php`
- Create: `app/Models/Passkey.php`
- Modify: `app/Models/User.php`

- [ ] **Install `web-auth/webauthn-lib`**

```bash
composer require web-auth/webauthn-lib:^5.3
```

Expected: library added to `vendor/`; `composer.json` and `composer.lock` updated.

- [ ] **Create migration**

```php
<?php
// database/migrations/2026_05_25_000001_create_passkeys_table.php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('passkeys', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('credential_id')->unique();
            $table->text('public_key');
            $table->unsignedBigInteger('sign_count')->default(0);
            $table->json('transports')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('passkeys');
    }
};
```

- [ ] **Run migration**

```bash
php artisan migrate
```

Expected: `passkeys` table created with no errors.

- [ ] **Create Passkey model**

```php
<?php
// app/Models/Passkey.php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Passkey extends Model
{
    use HasUlids;

    protected $fillable = [
        'user_id',
        'name',
        'credential_id',
        'public_key',
        'sign_count',
        'transports',
        'last_used_at',
    ];

    protected function casts(): array
    {
        return [
            'transports' => 'array',
            'last_used_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
```

- [ ] **Add `passkeys()` relationship to User**

In `app/Models/User.php`, add to the import block:

```php
use Illuminate\Database\Eloquent\Relations\HasMany;
```

Add the method inside the class (alongside `socialAccounts()`):

```php
/** @return HasMany<Passkey, $this> */
public function passkeys(): HasMany
{
    return $this->hasMany(Passkey::class);
}
```

- [ ] **Run full test suite to confirm nothing is broken**

```bash
php artisan test
```

Expected: all existing tests pass.

- [ ] **Commit**

```bash
git add database/migrations/2026_05_25_000001_create_passkeys_table.php \
    app/Models/Passkey.php \
    app/Models/User.php \
    composer.json \
    composer.lock
git commit -m "🎇 Add passkeys table, model, and User relationship"
```

---

## Task 2: WebAuthnService

**Files:**
- Create: `app/Services/WebAuthn/WebAuthnService.php`
- Create: `tests/Unit/Services/WebAuthnServiceTest.php`

The service wraps all webauthn-lib complexity. `verifyRegistration()` and `verifyAuthentication()` use the library's validator chain — controller tests mock them, so the unit tests here only cover options generation (which is deterministic and testable).

- [ ] **Write the failing tests**

```php
<?php
// tests/Unit/Services/WebAuthnServiceTest.php

use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialRequestOptions;

uses(\Tests\TestCase::class);

test('generateRegistrationOptions returns creation options with rp and two algorithms', function () {
    $user = User::factory()->make(['id' => 1, 'email' => 'test@example.com', 'name' => 'Test User']);
    $service = new WebAuthnService();

    $options = $service->generateRegistrationOptions($user);

    expect($options)->toBeInstanceOf(PublicKeyCredentialCreationOptions::class)
        ->and($options->rp->name)->toBe(config('app.name'))
        ->and(strlen($options->challenge))->toBeGreaterThan(0)
        ->and($options->pubKeyCredParams)->toHaveCount(2);
});

test('generateRegistrationOptions each call produces a different challenge', function () {
    $user = User::factory()->make(['id' => 1]);
    $service = new WebAuthnService();

    $a = $service->generateRegistrationOptions($user);
    $b = $service->generateRegistrationOptions($user);

    expect($a->challenge)->not->toBe($b->challenge);
});

test('generateAuthenticationOptions returns request options with empty allowCredentials', function () {
    $service = new WebAuthnService();

    $options = $service->generateAuthenticationOptions();

    expect($options)->toBeInstanceOf(PublicKeyCredentialRequestOptions::class)
        ->and(strlen($options->challenge))->toBeGreaterThan(0)
        ->and($options->allowCredentials)->toBeEmpty();
});
```

- [ ] **Run tests to confirm they fail**

```bash
php artisan test tests/Unit/Services/WebAuthnServiceTest.php
```

Expected: FAIL — class `WebAuthnService` not found.

- [ ] **Create the service**

```php
<?php
// app/Services/WebAuthn/WebAuthnService.php

namespace App\Services\WebAuthn;

use App\Models\Passkey;
use App\Models\User;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticationExtensions\ExtensionOutputCheckerHandler;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialLoader;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialSource;
use Webauthn\PublicKeyCredentialUserEntity;

class WebAuthnService
{
    private function rpId(): string
    {
        return parse_url(config('app.url'), PHP_URL_HOST);
    }

    public function generateRegistrationOptions(User $user): PublicKeyCredentialCreationOptions
    {
        return new PublicKeyCredentialCreationOptions(
            rp: new PublicKeyCredentialRpEntity(
                name: config('app.name'),
                id: $this->rpId(),
            ),
            user: new PublicKeyCredentialUserEntity(
                name: $user->email,
                id: (string) $user->id,
                displayName: $user->name,
            ),
            challenge: random_bytes(32),
            pubKeyCredParams: [
                new PublicKeyCredentialParameters(type: 'public-key', alg: -7),   // ES256
                new PublicKeyCredentialParameters(type: 'public-key', alg: -257), // RS256
            ],
            authenticatorSelection: new AuthenticatorSelectionCriteria(
                residentKey: AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_REQUIRED,
                userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_PREFERRED,
            ),
        );
    }

    public function generateAuthenticationOptions(): PublicKeyCredentialRequestOptions
    {
        return new PublicKeyCredentialRequestOptions(
            challenge: random_bytes(32),
            rpId: $this->rpId(),
            allowCredentials: [],
            userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
        );
    }

    /**
     * Verify a registration response from the browser.
     *
     * If the webauthn-lib constructor signatures differ from what's shown here,
     * check vendor/web-auth/webauthn-lib/README.md for the exact v4 factory API.
     */
    public function verifyRegistration(
        string $credentialJson,
        PublicKeyCredentialCreationOptions $options,
    ): PublicKeyCredentialSource {
        $attestationManager = AttestationStatementSupportManager::create();
        $attestationManager->add(NoneAttestationStatementSupport::create());

        $loader = PublicKeyCredentialLoader::create($attestationManager);
        $credential = $loader->load($credentialJson);

        $validator = AuthenticatorAttestationResponseValidator::create(
            $attestationManager,
            null,
            null,
            ExtensionOutputCheckerHandler::create(),
        );

        return $validator->check(
            authenticatorAttestationResponse: $credential->getResponse(),
            publicKeyCredentialCreationOptions: $options,
            request: $this->rpId(),
        );
    }

    /**
     * Verify an authentication response from the browser.
     * Returns the updated source (with new counter value).
     */
    public function verifyAuthentication(
        string $credentialJson,
        PublicKeyCredentialRequestOptions $options,
        Passkey $passkey,
    ): PublicKeyCredentialSource {
        $loader = PublicKeyCredentialLoader::create(
            AttestationStatementSupportManager::create()
        );
        $credential = $loader->load($credentialJson);

        $validator = AuthenticatorAssertionResponseValidator::create(
            publicKeyCredentialSourceRepository: null,
            tokenBindingHandler: null,
            extensionOutputCheckerHandler: ExtensionOutputCheckerHandler::create(),
            algorithmManager: \Cose\Algorithm\Manager::create()->add(
                \Cose\Algorithm\Signature\ECDSA\ES256::create(),
                \Cose\Algorithm\Signature\RSA\RS256::create(),
            ),
        );

        return $validator->check(
            credentialId: $credential->rawId,
            authenticatorAssertionResponse: $credential->getResponse(),
            publicKeyCredentialRequestOptions: $options,
            request: $this->rpId(),
            userHandle: null,
            credentialSource: $this->passkeyToSource($passkey),
        );
    }

    public function passkeyToSource(Passkey $passkey): PublicKeyCredentialSource
    {
        return PublicKeyCredentialSource::create(
            publicKeyCredentialId: base64_decode($passkey->credential_id),
            type: 'public-key',
            transports: $passkey->transports ?? [],
            attestationType: 'none',
            trustPath: new \Webauthn\TrustPath\EmptyTrustPath(),
            aaguid: \Symfony\Component\Uid\Uuid::fromString('00000000-0000-0000-0000-000000000000'),
            credentialPublicKey: base64_decode($passkey->public_key),
            userHandle: (string) $passkey->user_id,
            counter: $passkey->sign_count,
            otherUI: null,
        );
    }

    public function sourceToArray(PublicKeyCredentialSource $source): array
    {
        return [
            'credential_id' => base64_encode($source->publicKeyCredentialId),
            'public_key'    => base64_encode($source->credentialPublicKey),
            'sign_count'    => $source->counter,
            'transports'    => $source->transports,
        ];
    }
}
```

- [ ] **Run the unit tests**

```bash
php artisan test tests/Unit/Services/WebAuthnServiceTest.php
```

Expected: 3 passing.

- [ ] **Run full suite**

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add app/Services/WebAuthn/WebAuthnService.php \
    tests/Unit/Services/WebAuthnServiceTest.php
git commit -m "🎇 Add WebAuthnService"
```

---

## Task 3: PasskeyInvalidated mailable

**Files:**
- Create: `app/Mail/PasskeyInvalidated.php`
- Create: `resources/views/mail/passkey-invalidated.blade.php`

- [ ] **Write the failing test**

```php
<?php
// tests/Feature/Mail/PasskeyInvalidatedTest.php
// (create this file)

use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Models\User;

uses(\Tests\TestCase::class);

test('passkey invalidated email renders correctly for manual deletion', function () {
    $user = User::factory()->make(['email' => 'user@example.com']);
    $passkey = new Passkey(['name' => 'iPhone 15']);

    $mailable = new PasskeyInvalidated($passkey, automatic: false);
    $mailable->assertTo($user->email);

    $rendered = $mailable->render();

    expect($rendered)->toContain('iPhone 15')
        ->and($rendered)->toContain('removed');
});

test('passkey invalidated email renders correctly for automatic invalidation', function () {
    $passkey = new Passkey(['name' => 'MacBook']);

    $mailable = new PasskeyInvalidated($passkey, automatic: true);
    $rendered = $mailable->render();

    expect($rendered)->toContain('security')
        ->and($rendered)->toContain('MacBook');
});
```

Run: `php artisan test tests/Feature/Mail/PasskeyInvalidatedTest.php`

Expected: FAIL — class `PasskeyInvalidated` not found.

- [ ] **Create the mailable**

```php
<?php
// app/Mail/PasskeyInvalidated.php

namespace App\Mail;

use App\Models\Passkey;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasskeyInvalidated extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly Passkey $passkey,
        public readonly bool $automatic,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: $this->automatic
                ? 'Security alert: a passkey was disabled on your account'
                : 'A passkey was removed from your account',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.passkey-invalidated',
        );
    }
}
```

- [ ] **Create the email template**

```blade
{{-- resources/views/mail/passkey-invalidated.blade.php --}}
<x-mail::message>
@if ($automatic)
# Security alert

A passkey named **{{ $passkey->name }}** on your account was automatically disabled due to a potential security issue (an authentication replay was detected).

If this wasn't you, please contact support immediately and consider changing your password.
@else
# Passkey removed

The passkey named **{{ $passkey->name }}** was removed from your account.

If you did not do this, please contact support immediately.
@endif

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
```

- [ ] **Run the test**

```bash
php artisan test tests/Feature/Mail/PasskeyInvalidatedTest.php
```

Expected: 2 passing.

Fix the test — the `assertTo()` call needs a `to` address on the mailable. Update the test to not call `assertTo` (since the mailable is created without the user's email — the caller sets `to` when dispatching). Remove the `assertTo` line from the first test.

- [ ] **Run full suite**

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add app/Mail/PasskeyInvalidated.php \
    resources/views/mail/passkey-invalidated.blade.php \
    tests/Feature/Mail/PasskeyInvalidatedTest.php
git commit -m "🎇 Add PasskeyInvalidated mailable"
```

---

## Task 4: PasskeyAuthController (login ceremony) + routes

**Files:**
- Create: `app/Http/Controllers/Auth/PasskeyAuthController.php`
- Create: `tests/Feature/Auth/PasskeyAuthTest.php`
- Modify: `routes/web.php`

The controller has two endpoints:
- `options` — returns a WebAuthn challenge (stored in session); callable by guests
- `authenticate` — verifies the browser response, logs in the user

Both endpoints are JSON (not Inertia), so they return `response()->json(...)`.

- [ ] **Write the failing tests**

```php
<?php
// tests/Feature/Auth/PasskeyAuthTest.php

use App\Models\Passkey;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Webauthn\PublicKeyCredentialRequestOptions;

uses(\Tests\TestCase::class);

test('options endpoint returns a challenge and stores it in session', function () {
    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('generateAuthenticationOptions')
        ->once()
        ->andReturn($options);

    $response = $this->getJson(route('passkey.auth.options'));

    $response->assertOk();
    $response->assertJsonStructure(['challenge']);
    $this->assertNotNull(session('passkey.auth.options'));
});

test('authenticate endpoint logs in user with valid assertion', function () {
    $user = User::factory()->create();
    $passkey = Passkey::factory()->for($user)->create(['sign_count' => 0]);

    $updatedSource = mock(\Webauthn\PublicKeyCredentialSource::class);
    $updatedSource->counter = 1;

    $service = $this->mock(WebAuthnService::class);
    $service->shouldReceive('verifyAuthentication')
        ->once()
        ->andReturn($updatedSource);

    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
    session(['passkey.auth.options' => serialize($options)]);

    // The credential_id from our passkey, base64url-encoded as the browser sends it
    $credentialId = base64_encode(base64_decode($passkey->credential_id));

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id'       => base64_encode(base64_decode($passkey->credential_id)),
        'rawId'    => base64_encode(base64_decode($passkey->credential_id)),
        'type'     => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON'    => base64_encode('{}'),
            'signature'         => base64_encode('sig'),
        ],
    ]);

    $response->assertOk();
    $this->assertAuthenticatedAs($user);
    expect($passkey->fresh()->sign_count)->toBe(1);
    expect($passkey->fresh()->last_used_at)->not->toBeNull();
});

test('authenticate endpoint returns 401 when passkey not found', function () {
    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
    session(['passkey.auth.options' => serialize($options)]);

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id'       => base64_encode('unknown-credential'),
        'rawId'    => base64_encode('unknown-credential'),
        'type'     => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON'    => base64_encode('{}'),
            'signature'         => base64_encode('sig'),
        ],
    ]);

    $response->assertUnauthorized();
    $this->assertGuest();
});

test('authenticate endpoint returns 422 when session challenge is missing', function () {
    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id'       => base64_encode('cred'),
        'rawId'    => base64_encode('cred'),
        'type'     => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON'    => base64_encode('{}'),
            'signature'         => base64_encode('sig'),
        ],
    ]);

    $response->assertUnprocessable();
});

test('authenticate endpoint deletes passkey and sends email on sign_count regression', function () {
    \Illuminate\Support\Facades\Mail::fake();

    $user = User::factory()->create();
    $passkey = Passkey::factory()->for($user)->create(['sign_count' => 10]);

    $updatedSource = mock(\Webauthn\PublicKeyCredentialSource::class);
    $updatedSource->counter = 5; // regression

    $this->mock(WebAuthnService::class)
        ->shouldReceive('verifyAuthentication')
        ->once()
        ->andReturn($updatedSource);

    $options = new PublicKeyCredentialRequestOptions(
        challenge: random_bytes(32),
        rpId: 'localhost',
        allowCredentials: [],
        userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
    );
    session(['passkey.auth.options' => serialize($options)]);

    $response = $this->postJson(route('passkey.auth.authenticate'), [
        'id'       => base64_encode(base64_decode($passkey->credential_id)),
        'rawId'    => base64_encode(base64_decode($passkey->credential_id)),
        'type'     => 'public-key',
        'response' => [
            'authenticatorData' => base64_encode('data'),
            'clientDataJSON'    => base64_encode('{}'),
            'signature'         => base64_encode('sig'),
        ],
    ]);

    $response->assertUnauthorized();
    $this->assertGuest();
    $this->assertDatabaseMissing('passkeys', ['id' => $passkey->id]);
    \Illuminate\Support\Facades\Mail::assertSent(\App\Mail\PasskeyInvalidated::class);
});
```

- [ ] **Run tests to confirm they fail**

```bash
php artisan test tests/Feature/Auth/PasskeyAuthTest.php
```

Expected: FAIL — route `passkey.auth.options` not found.

- [ ] **Create the controller**

```php
<?php
// app/Http/Controllers/Auth/PasskeyAuthController.php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;
use Throwable;

class PasskeyAuthController extends Controller
{
    public function __construct(private readonly WebAuthnService $webAuthn) {}

    public function options(): JsonResponse
    {
        $options = $this->webAuthn->generateAuthenticationOptions();
        session(['passkey.auth.options' => serialize($options)]);

        return response()->json($options);
    }

    public function authenticate(Request $request): JsonResponse
    {
        $serialized = session('passkey.auth.options');
        if (! $serialized) {
            return response()->json(['message' => 'No active challenge. Please try again.'], 422);
        }

        $options = unserialize($serialized);
        session()->forget('passkey.auth.options');

        $credentialId = base64_encode(
            base64_decode(strtr($request->input('id'), '-_', '+/'))
        );

        $passkey = Passkey::where('credential_id', $credentialId)->first();
        if (! $passkey) {
            return response()->json(['message' => 'Passkey not recognised.'], 401);
        }

        try {
            $source = $this->webAuthn->verifyAuthentication(
                json_encode($request->all()),
                $options,
                $passkey,
            );
        } catch (Throwable) {
            return response()->json(['message' => 'Passkey verification failed.'], 401);
        }

        if ($source->counter < $passkey->sign_count) {
            $user = $passkey->user;
            Mail::to($user->email)->send(new PasskeyInvalidated($passkey, automatic: true));
            $passkey->delete();

            return response()->json(['message' => 'Passkey invalidated due to replay attack.'], 401);
        }

        $passkey->update([
            'sign_count'   => $source->counter,
            'last_used_at' => now(),
        ]);

        Auth::login($passkey->user, remember: true);

        return response()->json(['redirect' => route('dashboard')]);
    }
}
```

- [ ] **Add routes to `routes/web.php`**

Add before `require __DIR__.'/settings.php';`:

```php
Route::middleware('guest')->group(function () {
    Route::get('auth/passkey/options', [\App\Http\Controllers\Auth\PasskeyAuthController::class, 'options'])
        ->name('passkey.auth.options');
    Route::post('auth/passkey/authenticate', [\App\Http\Controllers\Auth\PasskeyAuthController::class, 'authenticate'])
        ->middleware('throttle:10,1')
        ->name('passkey.auth.authenticate');
});
```

- [ ] **Create a Passkey factory** (needed by tests)

```bash
php artisan make:factory PasskeyFactory --model=Passkey
```

Edit the generated `database/factories/PasskeyFactory.php`:

```php
<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Passkey>
 */
class PasskeyFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id'      => User::factory(),
            'name'         => $this->faker->words(2, true),
            'credential_id' => base64_encode(random_bytes(32)),
            'public_key'   => base64_encode(random_bytes(64)),
            'sign_count'   => 0,
            'transports'   => ['internal'],
            'last_used_at' => null,
        ];
    }
}
```

- [ ] **Run the tests**

```bash
php artisan test tests/Feature/Auth/PasskeyAuthTest.php
```

Expected: all pass. If the `sign_count` regression test fails because of mock `counter` access, use a real `PublicKeyCredentialSource` with a low counter instead of a mock — see next step.

- [ ] **Run full suite**

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add app/Http/Controllers/Auth/PasskeyAuthController.php \
    database/factories/PasskeyFactory.php \
    routes/web.php \
    tests/Feature/Auth/PasskeyAuthTest.php
git commit -m "🎇 Add PasskeyAuthController with options and authenticate endpoints"
```

---

## Task 5: PasskeyController (settings CRUD) + routes

**Files:**
- Create: `app/Http/Controllers/Settings/PasskeyController.php`
- Create: `tests/Feature/Settings/PasskeySettingsTest.php`
- Modify: `routes/settings.php`

Three endpoints: register options, store (verify + save), destroy (delete + email).

- [ ] **Write the failing tests**

```php
<?php
// tests/Feature/Settings/PasskeySettingsTest.php

use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Models\User;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;

uses(\Tests\TestCase::class);

// NOTE: challenge is stored in Cache (not session) keyed by user ID.
// The session-based approach was abandoned after discovering that logging in
// with "remember me" causes SessionGuard::migrate() to rotate the session ID
// between the GET /options and POST /register requests, losing the challenge.
// Cache::put('passkey_register_challenge_{userId}', ...) is immune to session rotation.

test('registerOptions returns a challenge and stores it in cache', function () {
    $user = User::factory()->create();

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Test', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );

    $this->mock(WebAuthnService::class)
        ->shouldReceive('generateRegistrationOptions')
        ->once()
        ->with(\Mockery::type(User::class))
        ->andReturn($options);

    $response = $this->actingAs($user)->getJson(route('passkey.register.options'));

    $response->assertOk();
    $response->assertJsonStructure(['challenge']);
    $this->assertNotNull(Cache::get('passkey_register_challenge_'.$user->id));
});

test('store saves a new passkey for the authenticated user', function () {
    $user = User::factory()->create();

    $source = mock(\Webauthn\PublicKeyCredentialSource::class);
    $source->publicKeyCredentialId = random_bytes(32);
    $source->credentialPublicKey = random_bytes(64);
    $source->counter = 0;
    $source->transports = ['internal'];

    $service = $this->mock(WebAuthnService::class);
    $service->shouldReceive('verifyRegistration')->once()->andReturn($source);
    $service->shouldReceive('sourceToArray')->once()->andReturn([
        'credential_id' => base64_encode($source->publicKeyCredentialId),
        'public_key'    => base64_encode($source->credentialPublicKey),
        'sign_count'    => 0,
        'transports'    => ['internal'],
    ]);

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Test', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );
    Cache::put('passkey_register_challenge_'.$user->id, serialize($options), 300);

    $response = $this->actingAs($user)->postJson(route('passkey.register.store'), [
        'name'     => 'iPhone 15',
        'id'       => base64_encode(random_bytes(32)),
        'rawId'    => base64_encode(random_bytes(32)),
        'type'     => 'public-key',
        'response' => [
            'attestationObject' => base64_encode('data'),
            'clientDataJSON'    => base64_encode('{}'),
        ],
    ]);

    $response->assertCreated();
    $this->assertDatabaseHas('passkeys', [
        'user_id' => $user->id,
        'name'    => 'iPhone 15',
    ]);
});

test('store returns 422 when credential_id already exists', function () {
    $user = User::factory()->create();
    $existing = Passkey::factory()->for($user)->create();

    $source = mock(\Webauthn\PublicKeyCredentialSource::class);
    $source->publicKeyCredentialId = base64_decode($existing->credential_id);
    $source->credentialPublicKey = random_bytes(64);
    $source->counter = 0;
    $source->transports = [];

    $service = $this->mock(WebAuthnService::class);
    $service->shouldReceive('verifyRegistration')->once()->andReturn($source);
    $service->shouldReceive('sourceToArray')->once()->andReturn([
        'credential_id' => $existing->credential_id,
        'public_key'    => base64_encode(random_bytes(64)),
        'sign_count'    => 0,
        'transports'    => [],
    ]);

    $options = new PublicKeyCredentialCreationOptions(
        rp: new PublicKeyCredentialRpEntity(name: 'Test', id: 'localhost'),
        user: new PublicKeyCredentialUserEntity(name: $user->email, id: (string) $user->id, displayName: $user->name),
        challenge: random_bytes(32),
        pubKeyCredParams: [],
    );
    Cache::put('passkey_register_challenge_'.$user->id, serialize($options), 300);

    $response = $this->actingAs($user)->postJson(route('passkey.register.store'), [
        'name'     => 'Duplicate',
        'id'       => $existing->credential_id,
        'rawId'    => $existing->credential_id,
        'type'     => 'public-key',
        'response' => ['attestationObject' => base64_encode('data'), 'clientDataJSON' => base64_encode('{}')],
    ]);

    $response->assertUnprocessable();
});

test('destroy deletes the passkey and sends email', function () {
    Mail::fake();
    $user = User::factory()->create();
    $passkey = Passkey::factory()->for($user)->create(['name' => 'MacBook']);

    $response = $this->actingAs($user)
        ->deleteJson(route('passkey.destroy', $passkey));

    $response->assertOk();
    $this->assertDatabaseMissing('passkeys', ['id' => $passkey->id]);
    Mail::assertSent(PasskeyInvalidated::class, fn ($mail) => ! $mail->automatic);
});

test('destroy prevents deleting another user\'s passkey', function () {
    $owner = User::factory()->create();
    $attacker = User::factory()->create();
    $passkey = Passkey::factory()->for($owner)->create();

    $response = $this->actingAs($attacker)
        ->deleteJson(route('passkey.destroy', $passkey));

    $response->assertForbidden();
    $this->assertDatabaseHas('passkeys', ['id' => $passkey->id]);
});
```

- [ ] **Run tests to confirm they fail**

```bash
php artisan test tests/Feature/Settings/PasskeySettingsTest.php
```

Expected: FAIL — route `passkey.register.options` not found.

- [ ] **Create the controller**

```php
<?php
// app/Http/Controllers/Settings/PasskeyController.php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Mail\PasskeyInvalidated;
use App\Models\Passkey;
use App\Services\WebAuthn\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Throwable;

class PasskeyController extends Controller
{
    public function __construct(private readonly WebAuthnService $webAuthn) {}

    public function registerOptions(Request $request): JsonResponse
    {
        $options = $this->webAuthn->generateRegistrationOptions($request->user());
        // Store in Cache keyed by user ID, not session. The "remember me" cookie
        // triggers SessionGuard::migrate() between GET and POST, rotating the session
        // ID and losing any session-stored challenge.
        Cache::put('passkey_register_challenge_'.$request->user()->id, serialize($options), 300);

        return response()->json($options);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['name' => ['required', 'string', 'max:255']]);

        $serialized = Cache::pull('passkey_register_challenge_'.$request->user()->id);
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
            return response()->json(['message' => 'Passkey verification failed: '.$e->getMessage()], 422);
        }

        $data = $this->webAuthn->sourceToArray($source);

        if (Passkey::where('credential_id', $data['credential_id'])->exists()) {
            return response()->json(['message' => 'This passkey is already registered.'], 422);
        }

        $passkey = $request->user()->passkeys()->create([
            'name' => $request->input('name'),
            ...$data,
        ]);

        return response()->json($passkey->only('id', 'name', 'last_used_at', 'created_at'), 201);
    }

    public function destroy(Request $request, Passkey $passkey): JsonResponse
    {
        if ($passkey->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        Mail::to($request->user()->email)->send(new PasskeyInvalidated($passkey, automatic: false));
        $passkey->delete();

        return response()->json(['message' => 'Passkey removed.']);
    }
}
```

- [ ] **Add routes to `routes/settings.php`**

Inside the existing `Route::middleware(['auth', 'verified'])` group, add:

```php
// Passkey management
Route::get('settings/passkeys/register/options', [\App\Http\Controllers\Settings\PasskeyController::class, 'registerOptions'])
    ->name('passkey.register.options');
Route::post('settings/passkeys/register', [\App\Http\Controllers\Settings\PasskeyController::class, 'store'])
    ->name('passkey.register.store');
Route::delete('settings/passkeys/{passkey}', [\App\Http\Controllers\Settings\PasskeyController::class, 'destroy'])
    ->name('passkey.destroy');
```

- [ ] **Run the tests**

```bash
php artisan test tests/Feature/Settings/PasskeySettingsTest.php
```

Expected: all pass.

- [ ] **Run full suite**

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add app/Http/Controllers/Settings/PasskeyController.php \
    routes/settings.php \
    tests/Feature/Settings/PasskeySettingsTest.php
git commit -m "🎇 Add PasskeyController with register and destroy endpoints"
```

---

## Task 6: Post-registration redirect + passkey setup page

**Files:**
- Create: `app/Http/Responses/RegisteredWithPasskeyResponse.php`
- Create: `resources/js/pages/auth/passkey-setup.tsx`
- Modify: `app/Providers/FortifyServiceProvider.php`
- Modify: `routes/settings.php`

After Fortify registers a user, instead of going to `/dashboard` immediately, redirect to `/register/passkey`. That page offers "Set up a passkey" or "Skip".

- [ ] **Write the failing test**

Add to `tests/Feature/Auth/RegistrationTest.php` (append to existing file):

```php
test('after registration user is redirected to passkey setup', function () {
    $response = $this->post(route('register'), [
        'name'                  => 'Test User',
        'email'                 => 'test@example.com',
        'password'              => 'password',
        'password_confirmation' => 'password',
    ]);

    $response->assertRedirect(route('passkey.setup'));
});

test('passkey setup page renders', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get(route('passkey.setup'));

    $response->assertOk();
    $response->assertInertia(fn ($page) => $page->component('auth/passkey-setup'));
});

test('skip passkey setup redirects to dashboard', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('passkey.setup.skip'));

    $response->assertRedirect(route('dashboard'));
});
```

- [ ] **Run the tests to confirm they fail**

```bash
php artisan test tests/Feature/Auth/RegistrationTest.php
```

Expected: existing tests pass, new ones fail — route `passkey.setup` not found.

- [ ] **Create the registered response**

```php
<?php
// app/Http/Responses/RegisteredWithPasskeyResponse.php

namespace App\Http\Responses;

use Laravel\Fortify\Contracts\RegisteredUserResponse;

class RegisteredWithPasskeyResponse implements RegisteredUserResponse
{
    public function toResponse($request)
    {
        return redirect()->route('passkey.setup');
    }
}
```

- [ ] **Add routes to `routes/settings.php`** (inside the `auth` middleware group)

```php
Route::get('register/passkey', fn () => \Inertia\Inertia::render('auth/passkey-setup'))
    ->name('passkey.setup');
Route::post('register/passkey/skip', fn () => redirect()->route('dashboard'))
    ->name('passkey.setup.skip');
```

- [ ] **Override the registered response in FortifyServiceProvider**

In `app/Providers/FortifyServiceProvider.php`, add to the `register()` method:

```php
public function register(): void
{
    $this->app->bind(
        \Laravel\Fortify\Contracts\RegisteredUserResponse::class,
        \App\Http\Responses\RegisteredWithPasskeyResponse::class,
    );
}
```

- [ ] **Create the passkey setup React page**

```tsx
// resources/js/pages/auth/passkey-setup.tsx
import { Head, router } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import { usePasskey } from '@/hooks/use-passkey';
import { Button } from '@/components/ui/button';

export default function PasskeySetup() {
    const { register, isSupported, error, loading } = usePasskey();

    const handleSetup = async () => {
        const ok = await register('My first passkey');
        if (ok) {
            router.visit(route('dashboard'));
        }
    };

    return (
        <>
            <Head title="Set up a passkey" />

            <div className="flex flex-col items-center gap-6 text-center">
                <KeyRound className="h-12 w-12 text-primary" />

                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold">Set up a passkey</h1>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        Passkeys let you sign in with your fingerprint, face, or device PIN — no
                        password needed next time.
                    </p>
                </div>

                {error && (
                    <p className="text-sm text-destructive">{error}</p>
                )}

                <div className="flex flex-col gap-3 w-full max-w-xs">
                    {isSupported && (
                        <Button onClick={handleSetup} disabled={loading}>
                            {loading ? 'Setting up…' : 'Set up passkey'}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        onClick={() => router.post(route('passkey.setup.skip'))}
                    >
                        Skip for now
                    </Button>
                </div>
            </div>
        </>
    );
}

PasskeySetup.layout = {
    title: 'One more step',
    description: 'Add a passkey for faster, more secure sign-in',
};
```

- [ ] **Run all registration tests**

```bash
php artisan test tests/Feature/Auth/RegistrationTest.php
```

Expected: all pass.

- [ ] **Run full suite**

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add app/Http/Responses/RegisteredWithPasskeyResponse.php \
    app/Providers/FortifyServiceProvider.php \
    resources/js/pages/auth/passkey-setup.tsx \
    routes/settings.php \
    tests/Feature/Auth/RegistrationTest.php
git commit -m "🎇 Redirect post-registration to passkey setup page"
```

---

## Task 7: `usePasskey` hook + Wayfinder types

**Files:**
- Create: `resources/js/hooks/use-passkey.ts`

This hook wraps `navigator.credentials.create/get`, handles base64url conversion, and exposes `register()`, `authenticate()`, and `startConditional()`.

- [ ] **Generate Wayfinder types** (must be done after adding all routes so routes/*.ts files exist)

```bash
php artisan wayfinder:generate
```

This generates/updates `resources/js/routes/passkey*.ts` files used by TypeScript.

- [ ] **Create the hook**

```typescript
// resources/js/hooks/use-passkey.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';

function base64urlToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

type PublicKeyCredentialWithResponse = PublicKeyCredential & {
    response: AuthenticatorAssertionResponse | AuthenticatorAttestationResponse;
};

function serializeCredential(credential: PublicKeyCredentialWithResponse): object {
    const resp = credential.response;
    const base: Record<string, unknown> = {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
    };

    if (resp instanceof AuthenticatorAttestationResponse) {
        base.response = {
            attestationObject: bufferToBase64url(resp.attestationObject),
            clientDataJSON: bufferToBase64url(resp.clientDataJSON),
        };
    } else if (resp instanceof AuthenticatorAssertionResponse) {
        base.response = {
            authenticatorData: bufferToBase64url(resp.authenticatorData),
            clientDataJSON: bufferToBase64url(resp.clientDataJSON),
            signature: bufferToBase64url(resp.signature),
            userHandle: resp.userHandle ? bufferToBase64url(resp.userHandle) : null,
        };
    }

    return base;
}

export type UsePasskeyReturn = {
    isSupported: boolean;
    loading: boolean;
    error: string | null;
    register: (name: string) => Promise<boolean>;
    authenticate: () => Promise<void>;
    startConditional: () => void;
    abortConditional: () => void;
};

export function usePasskey(): UsePasskeyReturn {
    const isSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const fetchOptions = useCallback(async (url: string) => {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error('Failed to fetch WebAuthn options');
        return res.json();
    }, []);

    const prepareCreationOptions = useCallback(
        (raw: PublicKeyCredentialCreationOptionsJSON): PublicKeyCredentialCreationOptions => ({
            ...raw,
            challenge: base64urlToBuffer(raw.challenge as unknown as string),
            user: {
                ...raw.user,
                id: base64urlToBuffer(raw.user.id as unknown as string),
            },
            excludeCredentials: (raw.excludeCredentials ?? []).map((c) => ({
                ...c,
                id: base64urlToBuffer(c.id as unknown as string),
            })),
        }),
        [],
    );

    const prepareRequestOptions = useCallback(
        (raw: PublicKeyCredentialRequestOptionsJSON): PublicKeyCredentialRequestOptions => ({
            ...raw,
            challenge: base64urlToBuffer(raw.challenge as unknown as string),
            allowCredentials: (raw.allowCredentials ?? []).map((c) => ({
                ...c,
                id: base64urlToBuffer(c.id as unknown as string),
            })),
        }),
        [],
    );

    const register = useCallback(
        async (name: string): Promise<boolean> => {
            if (!isSupported) return false;
            setLoading(true);
            setError(null);
            try {
                const raw = await fetchOptions(route('passkey.register.options'));
                const options = prepareCreationOptions(raw);
                const credential = (await navigator.credentials.create({
                    publicKey: options,
                })) as PublicKeyCredentialWithResponse | null;
                if (!credential) throw new Error('No credential returned');

                const res = await fetch(route('passkey.register.store'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-XSRF-TOKEN': decodeURIComponent(
                            document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
                        ),
                    },
                    body: JSON.stringify({ name, ...serializeCredential(credential) }),
                });
                if (!res.ok) {
                    const body = await res.json();
                    throw new Error(body.message ?? 'Registration failed');
                }
                return true;
            } catch (e: unknown) {
                if (e instanceof Error && e.name !== 'NotAllowedError') {
                    setError(e.message);
                }
                return false;
            } finally {
                setLoading(false);
            }
        },
        [isSupported, fetchOptions, prepareCreationOptions],
    );

    const runAuthentication = useCallback(
        async (mediation: CredentialMediationRequirement, signal?: AbortSignal): Promise<void> => {
            const raw = await fetchOptions(route('passkey.auth.options'));
            const options = prepareRequestOptions(raw);
            const credential = (await navigator.credentials.get({
                publicKey: options,
                mediation,
                signal,
            })) as PublicKeyCredentialWithResponse | null;
            if (!credential) return;

            const res = await fetch(route('passkey.auth.authenticate'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-XSRF-TOKEN': decodeURIComponent(
                        document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? '',
                    ),
                },
                body: JSON.stringify(serializeCredential(credential)),
            });
            if (!res.ok) {
                const body = await res.json();
                throw new Error(body.message ?? 'Authentication failed');
            }
            const body = await res.json();
            router.visit(body.redirect ?? route('dashboard'));
        },
        [fetchOptions, prepareRequestOptions],
    );

    const authenticate = useCallback(async (): Promise<void> => {
        if (!isSupported) return;
        setLoading(true);
        setError(null);
        try {
            await runAuthentication('optional');
        } catch (e: unknown) {
            if (e instanceof Error && e.name !== 'NotAllowedError') {
                setError(e.message);
            }
        } finally {
            setLoading(false);
        }
    }, [isSupported, runAuthentication]);

    const startConditional = useCallback((): void => {
        if (!isSupported) return;
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        runAuthentication('conditional', abortRef.current.signal).catch(() => {});
    }, [isSupported, runAuthentication]);

    const abortConditional = useCallback((): void => {
        abortRef.current?.abort();
    }, []);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    return { isSupported, loading, error, register, authenticate, startConditional, abortConditional };
}
```

- [ ] **Run full suite** (no new PHP tests for this task)

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add resources/js/hooks/use-passkey.ts resources/js/routes/
git commit -m "🎇 Add usePasskey hook and Wayfinder route types"
```

---

## Task 8: Login page — conditional UI + explicit button

**Files:**
- Modify: `resources/js/pages/auth/login.tsx`

- [ ] **Update the login page**

Replace `resources/js/pages/auth/login.tsx` with:

```tsx
import { Form, Head } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { usePasskey } from '@/hooks/use-passkey';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
};

export default function Login({ status, canResetPassword, canRegister }: Props) {
    const { isSupported, loading, error, authenticate, startConditional, abortConditional } =
        usePasskey();

    useEffect(() => {
        if (isSupported) {
            startConditional();
        }
        return abortConditional;
    }, [isSupported, startConditional, abortConditional]);

    return (
        <>
            <Head title="Log in" />

            <Form
                {...store.form()}
                resetOnSuccess={['password']}
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoFocus
                                    tabIndex={1}
                                    autoComplete="username webauthn"
                                    placeholder="email@example.com"
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">Password</Label>
                                    {canResetPassword && (
                                        <TextLink
                                            href={request()}
                                            className="ml-auto text-sm"
                                            tabIndex={5}
                                        >
                                            Forgot password?
                                        </TextLink>
                                    )}
                                </div>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    tabIndex={2}
                                    autoComplete="current-password"
                                    placeholder="Password"
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox id="remember" name="remember" tabIndex={3} />
                                <Label htmlFor="remember">Remember me</Label>
                            </div>

                            <Button
                                type="submit"
                                className="mt-4 w-full"
                                tabIndex={4}
                                disabled={processing}
                                data-test="login-button"
                            >
                                {processing && <Spinner />}
                                Log in
                            </Button>

                            {isSupported && (
                                <div className="relative flex items-center gap-3">
                                    <div className="flex-1 border-t" />
                                    <span className="text-xs text-muted-foreground">or</span>
                                    <div className="flex-1 border-t" />
                                </div>
                            )}

                            {isSupported && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    tabIndex={6}
                                    disabled={loading}
                                    onClick={authenticate}
                                    data-test="passkey-button"
                                >
                                    {loading ? <Spinner /> : <KeyRound className="h-4 w-4" />}
                                    Sign in with passkey
                                </Button>
                            )}

                            {error && (
                                <p className="text-center text-sm text-destructive">{error}</p>
                            )}
                        </div>

                        {canRegister && (
                            <div className="text-center text-sm text-muted-foreground">
                                Don't have an account?{' '}
                                <TextLink href={register()} tabIndex={7}>
                                    Sign up
                                </TextLink>
                            </div>
                        )}
                    </>
                )}
            </Form>

            {status && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {status}
                </div>
            )}
        </>
    );
}

Login.layout = {
    title: 'Log in to your account',
    description: 'Enter your email and password below to log in',
};
```

- [ ] **Run full suite**

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add resources/js/pages/auth/login.tsx
git commit -m "🖼️ Add conditional passkey UI and Sign in with passkey button to login page"
```

---

## Task 9: Security settings — passkeys section

**Files:**
- Create: `resources/js/components/passkey-list.tsx`
- Modify: `resources/js/pages/settings/security.tsx`

The security settings page gains a new section listing the user's passkeys with a delete button and an "Add passkey" button.

The security settings controller needs to pass passkeys to the page. Update `PasskeyController` (settings) OR `SecurityController` to include passkeys in props — the cleanest approach is to add passkeys to the `SecurityController::edit()` props since that's the page being rendered.

- [ ] **Update `SecurityController::edit()` to include passkeys**

In `app/Http/Controllers/Settings/SecurityController.php`, add to the `$props` array:

```php
// At the top add:
use App\Models\Passkey;

// Inside edit(), add to $props before the return:
$props['passkeys'] = $request->user()->passkeys()
    ->select('id', 'name', 'last_used_at', 'created_at')
    ->latest()
    ->get();
```

- [ ] **Create the PasskeyList component**

```tsx
// resources/js/components/passkey-list.tsx
import { Form } from '@inertiajs/react';
import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { usePasskey } from '@/hooks/use-passkey';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type PasskeyData = {
    id: string;
    name: string;
    last_used_at: string | null;
    created_at: string;
};

type Props = {
    passkeys: PasskeyData[];
};

export default function PasskeyList({ passkeys }: Props) {
    const { isSupported, loading, error, register } = usePasskey();
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');

    const handleAdd = async () => {
        if (!newName.trim()) return;
        const ok = await register(newName.trim());
        if (ok) {
            setAdding(false);
            setNewName('');
            // Reload the page to refresh the passkey list via Inertia
            window.location.reload();
        }
    };

    return (
        <div className="space-y-4">
            {passkeys.length === 0 && (
                <p className="text-sm text-muted-foreground">No passkeys registered yet.</p>
            )}

            <ul className="space-y-2">
                {passkeys.map((pk) => (
                    <li
                        key={pk.id}
                        className="flex items-center justify-between rounded-md border px-4 py-3"
                    >
                        <div className="flex items-center gap-3">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">{pk.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {pk.last_used_at
                                        ? `Last used ${new Date(pk.last_used_at).toLocaleDateString()}`
                                        : `Added ${new Date(pk.created_at).toLocaleDateString()}`}
                                </p>
                            </div>
                        </div>
                        <Form method="delete" action={route('passkey.destroy', pk.id)}>
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="icon"
                                    disabled={processing}
                                    aria-label={`Remove ${pk.name}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </Form>
                    </li>
                ))}
            </ul>

            {isSupported && (
                adding ? (
                    <div className="flex items-end gap-2">
                        <div className="flex-1 grid gap-2">
                            <Label htmlFor="passkey-name">Passkey name</Label>
                            <Input
                                id="passkey-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g. iPhone 15"
                                autoFocus
                            />
                        </div>
                        <Button onClick={handleAdd} disabled={loading || !newName.trim()}>
                            {loading ? 'Adding…' : 'Add'}
                        </Button>
                        <Button variant="ghost" onClick={() => { setAdding(false); setNewName(''); }}>
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <Button variant="outline" onClick={() => setAdding(true)}>
                        Add passkey
                    </Button>
                )
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
```

- [ ] **Add passkeys section to security settings page**

In `resources/js/pages/settings/security.tsx`, add to the import block:

```tsx
import PasskeyList from '@/components/passkey-list';
```

Add `passkeys` to the Props type:

```tsx
type Props = {
    canManageTwoFactor?: boolean;
    requiresConfirmation?: boolean;
    twoFactorEnabled?: boolean;
    passkeys?: Array<{ id: string; name: string; last_used_at: string | null; created_at: string }>;
};
```

Add the destructured prop:

```tsx
export default function Security({
    canManageTwoFactor = false,
    requiresConfirmation = false,
    twoFactorEnabled = false,
    passkeys = [],
}: Props) {
```

Add a new section after the 2FA section (before the closing `</>`):

```tsx
<div className="space-y-6">
    <Heading
        variant="small"
        title="Passkeys"
        description="Sign in with your fingerprint, face, or device PIN instead of a password"
    />
    <PasskeyList passkeys={passkeys} />
</div>
```

- [ ] **Run full suite**

```bash
php artisan test
```

Expected: all pass.

- [ ] **Commit**

```bash
git add app/Http/Controllers/Settings/SecurityController.php \
    resources/js/components/passkey-list.tsx \
    resources/js/pages/settings/security.tsx
git commit -m "🖼️ Add passkeys management section to security settings"
```

---

## Self-Review Checklist

Checking the spec against the plan:

- [x] **Database** — Task 1 covers migration with all columns from the spec.
- [x] **User relationship** — Task 1 adds `hasMany(Passkey::class)`.
- [x] **WebAuthnService** — Task 2 implements options generation + verification + conversion helpers.
- [x] **PasskeyAuthController (options + authenticate)** — Task 4.
- [x] **PasskeyController (registerOptions + store + destroy)** — Task 5.
- [x] **sign_count regression → delete + email** — Task 4 authenticate endpoint handles this.
- [x] **Manual delete → email** — Task 5 destroy endpoint handles this.
- [x] **PasskeyInvalidated mailable (manual vs automatic copy)** — Task 3.
- [x] **Usernameless (empty allowCredentials)** — `generateAuthenticationOptions()` in Task 2.
- [x] **Conditional UI on login page** — Task 8 adds `startConditional()` on mount + `autocomplete="username webauthn"`.
- [x] **Explicit button on login page** — Task 8.
- [x] **WebAuthn not supported → hide button** — `usePasskey.isSupported` gate in Tasks 7 and 8.
- [x] **Multiple named passkeys** — PasskeyList in Task 9 lists all passkeys with delete buttons.
- [x] **Add passkey from settings** — Task 9 PasskeyList "Add passkey" flow.
- [x] **Post-registration setup page** — Task 6.
- [x] **Skip post-registration setup** — Task 6 skip route.
- [x] **Auth tests** — Task 4 tests: options, authenticate success, not found, missing challenge, replay attack.
- [x] **Settings tests** — Task 5 tests: registerOptions, store, duplicate credential, destroy, scope.
- [x] **Mailable tests** — Task 3.
- [x] **WebAuthnService unit tests** — Task 2.
- [x] **Passkey factory** — Task 4 (needed by tests).
