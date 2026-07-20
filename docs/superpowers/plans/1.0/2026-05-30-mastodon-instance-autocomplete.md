# Mastodon Instance Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain instance URL text input on the Connected Accounts page with an autocomplete combobox that suggests Mastodon instances from the joinmastodon.org public server list.

**Architecture:** A new `GET /auth/mastodon/instances?q=` endpoint in `MastodonController` fetches the full server list from `api.joinmastodon.org`, caches it for 24 hours, and filters in PHP. A new `InstanceCombobox` React component wraps headlessui's `Combobox`, debounces keystrokes at 300ms, and renders domain + description rows. Free-text entry is always allowed — autocomplete is a progressive enhancement.

**Tech Stack:** Laravel (Http client, Cache), PHP Pest tests, React + headlessui v2 Combobox, axios, Vitest + Testing Library

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `app/Http/Controllers/Social/MastodonController.php` | Add `instances()` method |
| Modify | `routes/settings.php` | Register `GET /auth/mastodon/instances` |
| Regenerate | `resources/js/routes/mastodon/index.ts` | Wayfinder auto-generates typed route helper |
| Create | `resources/js/components/InstanceCombobox.tsx` | Autocomplete combobox component |
| Create | `resources/js/components/InstanceCombobox.test.tsx` | Component unit tests |
| Modify | `resources/js/pages/settings/connections.tsx` | Swap `<Input>` for `<InstanceCombobox>` |
| Modify | `tests/Feature/Social/MastodonControllerTest.php` | Add `instances()` endpoint tests |

---

## Task 1: Backend — `instances()` endpoint + tests

**Files:**
- Modify: `app/Http/Controllers/Social/MastodonController.php`
- Modify: `routes/settings.php`
- Modify: `tests/Feature/Social/MastodonControllerTest.php`

- [ ] **Step 1: Add the failing tests**

Open `tests/Feature/Social/MastodonControllerTest.php` and add the following imports at the top of the file (after the existing `use` statements):

```php
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
```

Then append these test cases at the bottom of the file:

```php
it('redirects guests away from mastodon instances', function () {
    $response = $this->get('/auth/mastodon/instances?q=ma');

    $response->assertRedirect('/login');
});

it('returns empty array when query is shorter than 2 characters', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->get('/auth/mastodon/instances?q=m');

    $response->assertOk();
    $response->assertExactJson([]);
});

it('returns filtered instances matching the query', function () {
    Http::fake([
        'api.joinmastodon.org/servers' => Http::response([
            ['domain' => 'mastodon.social', 'description' => "The original server\r\n"],
            ['domain' => 'fosstodon.org', 'description' => 'Open source focused'],
            ['domain' => 'hachyderm.io', 'description' => 'A tech community'],
        ], 200),
    ]);

    $user = User::factory()->create();
    $response = $this->actingAs($user)->get('/auth/mastodon/instances?q=ma');

    $response->assertOk();
    $response->assertJson([
        ['name' => 'mastodon.social', 'description' => 'The original server'],
    ]);
    // fosstodon.org does not contain 'ma'
    $this->assertCount(1, $response->json());
});

it('returns empty array when the upstream fetch fails', function () {
    Http::fake([
        'api.joinmastodon.org/servers' => Http::response(null, 503),
    ]);
    Cache::forget('mastodon_servers_list');

    $user = User::factory()->create();
    $response = $this->actingAs($user)->get('/auth/mastodon/instances?q=ma');

    $response->assertOk();
    $response->assertExactJson([]);
});

it('caches the server list and does not re-fetch on subsequent requests', function () {
    Http::fake([
        'api.joinmastodon.org/servers' => Http::response([
            ['domain' => 'mastodon.social', 'description' => 'The original server'],
        ], 200),
    ]);
    Cache::forget('mastodon_servers_list');

    $user = User::factory()->create();
    $this->actingAs($user)->get('/auth/mastodon/instances?q=ma');
    $this->actingAs($user)->get('/auth/mastodon/instances?q=ma');

    Http::assertSentCount(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /path/to/sprouter && ./vendor/bin/pest tests/Feature/Social/MastodonControllerTest.php --filter="instances"
```

Expected: 5 failures — route not found (404) or method not found.

- [ ] **Step 3: Register the route**

Open `routes/settings.php`. Inside the `Route::middleware(['auth', 'verified'])->group(...)` block, add the new route after the existing Mastodon routes (around line 48):

```php
// Mastodon OAuth
Route::post('auth/mastodon', [MastodonController::class, 'redirect'])->name('mastodon.redirect');
Route::get('auth/mastodon/callback', [MastodonController::class, 'callback'])->name('mastodon.callback');
Route::get('auth/mastodon/instances', [MastodonController::class, 'instances'])->name('mastodon.instances');
```

- [ ] **Step 4: Add the `instances()` method to the controller**

Open `app/Http/Controllers/Social/MastodonController.php`. Add these imports after the existing `use` statements:

```php
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
```

Then add the following method to the `MastodonController` class, after the `callback()` method and before `validateInstanceUrl()`:

```php
public function instances(Request $request): JsonResponse
{
    $q = strtolower(trim($request->string('q')->toString()));

    if (mb_strlen($q) < 2) {
        return response()->json([]);
    }

    $servers = Cache::get('mastodon_servers_list');

    if ($servers === null) {
        try {
            $response = Http::timeout(5)->get('https://api.joinmastodon.org/servers');
            if ($response->successful()) {
                $servers = $response->json() ?? [];
                Cache::put('mastodon_servers_list', $servers, 86400);
            } else {
                $servers = [];
            }
        } catch (\Exception) {
            $servers = [];
        }
    }

    $matches = collect($servers)
        ->filter(fn ($s) => str_contains(strtolower($s['domain'] ?? ''), $q)
            || str_contains(strtolower($s['description'] ?? ''), $q))
        ->take(8)
        ->map(fn ($s) => [
            'name'        => $s['domain'],
            'description' => trim(str_replace(["\r\n", "\r", "\n"], ' ', $s['description'] ?? '')),
        ])
        ->values();

    return response()->json($matches);
}
```

- [ ] **Step 5: Run the tests and verify they pass**

```bash
./vendor/bin/pest tests/Feature/Social/MastodonControllerTest.php --filter="instances"
```

Expected: 5 passing.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/Http/Controllers/Social/MastodonController.php routes/settings.php tests/Feature/Social/MastodonControllerTest.php
git commit -m "🎇 Add GET /auth/mastodon/instances autocomplete endpoint"
```

---

## Task 2: Regenerate Wayfinder route types

**Files:**
- Regenerate: `resources/js/routes/mastodon/index.ts`

- [ ] **Step 1: Regenerate the typed route helpers**

```bash
php artisan wayfinder:generate
```

Expected: no errors. The file `resources/js/routes/mastodon/index.ts` will now include an `instances` export with `instances.url({ query: { q: '...' } })`.

- [ ] **Step 2: Verify the new export exists**

```bash
grep "instances" resources/js/routes/mastodon/index.ts
```

Expected: lines referencing `MastodonController::instances` and `export const instances`.

- [ ] **Step 3: Commit**

```bash
git add resources/js/routes/mastodon/index.ts
git commit -m "⚙️ Regenerate wayfinder routes for mastodon.instances"
```

---

## Task 3: Frontend — `InstanceCombobox` component + tests

**Files:**
- Create: `resources/js/components/InstanceCombobox.tsx`
- Create: `resources/js/components/InstanceCombobox.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

Create `resources/js/components/InstanceCombobox.test.tsx` with this content:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InstanceCombobox from './InstanceCombobox'

vi.mock('axios')

beforeEach(() => {
    vi.mocked(axios.get).mockReset()
})

describe('InstanceCombobox', () => {
    it('renders an input with the given id and placeholder', () => {
        render(<InstanceCombobox id="instance_url" name="instance_url" placeholder="mastodon.social" />)

        const input = screen.getByRole('combobox')
        expect(input).toBeInTheDocument()
        expect(input).toHaveAttribute('placeholder', 'mastodon.social')
    })

    it('does not fetch when fewer than 2 characters are typed', async () => {
        render(<InstanceCombobox id="instance_url" name="instance_url" />)

        await userEvent.type(screen.getByRole('combobox'), 'm')

        expect(axios.get).not.toHaveBeenCalled()
    })

    it('fetches and displays suggestions after typing 2+ characters', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: [
                { name: 'mastodon.social', description: 'The original server' },
                { name: 'mastodon.world', description: 'A general instance' },
            ],
        })

        render(<InstanceCombobox id="instance_url" name="instance_url" />)

        await userEvent.type(screen.getByRole('combobox'), 'ma')

        await waitFor(() => {
            expect(screen.getByText('mastodon.social')).toBeInTheDocument()
            expect(screen.getByText('The original server')).toBeInTheDocument()
            expect(screen.getByText('mastodon.world')).toBeInTheDocument()
        })
    })

    it('fills the hidden input when a suggestion is selected', async () => {
        vi.mocked(axios.get).mockResolvedValue({
            data: [{ name: 'mastodon.social', description: 'The original server' }],
        })

        render(<InstanceCombobox id="instance_url" name="instance_url" />)

        await userEvent.type(screen.getByRole('combobox'), 'ma')

        await waitFor(() => {
            expect(screen.getByText('mastodon.social')).toBeInTheDocument()
        })

        await userEvent.click(screen.getByText('mastodon.social'))

        const hidden = document.querySelector('input[name="instance_url"][type="hidden"]') as HTMLInputElement
        expect(hidden?.value).toBe('mastodon.social')
    })

    it('shows no dropdown when the fetch returns an empty array', async () => {
        vi.mocked(axios.get).mockResolvedValue({ data: [] })

        render(<InstanceCombobox id="instance_url" name="instance_url" />)

        await userEvent.type(screen.getByRole('combobox'), 'zz')

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalled()
        })

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('shows no dropdown when the fetch errors', async () => {
        vi.mocked(axios.get).mockRejectedValue(new Error('Network error'))

        render(<InstanceCombobox id="instance_url" name="instance_url" />)

        await userEvent.type(screen.getByRole('combobox'), 'ma')

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalled()
        })

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm run test -- InstanceCombobox
```

Expected: failures — module not found.

- [ ] **Step 3: Create the component**

Create `resources/js/components/InstanceCombobox.tsx`:

```tsx
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import axios from 'axios'
import { Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import mastodon from '@/routes/mastodon'

interface Suggestion {
    name: string
    description: string
}

interface InstanceComboboxProps {
    id: string
    name: string
    placeholder?: string
}

export default function InstanceCombobox({ id, name, placeholder }: InstanceComboboxProps) {
    const [value, setValue] = useState('')
    const [suggestions, setSuggestions] = useState<Suggestion[]>([])
    const [loading, setLoading] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (value.length < 2) {
            setSuggestions([])
            return
        }

        if (debounceRef.current) clearTimeout(debounceRef.current)

        debounceRef.current = setTimeout(async () => {
            setLoading(true)
            try {
                const res = await axios.get<Suggestion[]>(
                    mastodon.instances.url({ query: { q: value } }),
                )
                setSuggestions(res.data)
            } catch {
                setSuggestions([])
            } finally {
                setLoading(false)
            }
        }, 300)

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [value])

    return (
        <div className="relative">
            <Combobox
                value={value}
                onChange={(v: string | null) => setValue(v ?? '')}
            >
                <input type="hidden" name={name} value={value} />
                <div className="relative">
                    <ComboboxInput
                        id={id}
                        placeholder={placeholder}
                        autoComplete="off"
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onChange={(e) => setValue(e.target.value)}
                    />
                    {loading && (
                        <Loader2 className="absolute right-2 top-2 size-4 animate-spin text-muted-foreground" />
                    )}
                </div>
                {suggestions.length > 0 && (
                    <ComboboxOptions className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
                        {suggestions.map((s) => (
                            <ComboboxOption
                                key={s.name}
                                value={s.name}
                                className="cursor-pointer px-3 py-2 text-sm data-focus:bg-accent data-focus:text-accent-foreground"
                            >
                                <p className="font-medium">{s.name}</p>
                                {s.description && (
                                    <p className="text-xs text-muted-foreground">{s.description}</p>
                                )}
                            </ComboboxOption>
                        ))}
                    </ComboboxOptions>
                )}
            </Combobox>
        </div>
    )
}
```

- [ ] **Step 4: Run the frontend tests and verify they pass**

```bash
npm run test -- InstanceCombobox
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/InstanceCombobox.tsx resources/js/components/InstanceCombobox.test.tsx
git commit -m "🎇 Add InstanceCombobox component with joinmastodon.org suggestions"
```

---

## Task 4: Wire up in connections page

**Files:**
- Modify: `resources/js/pages/settings/connections.tsx`

- [ ] **Step 1: Replace the import and Input usage**

Open `resources/js/pages/settings/connections.tsx`.

Add the import at the top alongside the other component imports:

```tsx
import InstanceCombobox from '@/components/InstanceCombobox'
```

Find and replace the `<Input>` for instance_url (around line 107):

```tsx
// Remove:
<Input
    id="instance_url"
    name="instance_url"
    placeholder="https://mastodon.social"
/>

// Replace with:
<InstanceCombobox
    id="instance_url"
    name="instance_url"
    placeholder="https://mastodon.social"
/>
```

You can also remove the `Input` import if it is no longer used elsewhere on the page. Check first — the Bluesky form section also uses `Input`, so keep the import.

- [ ] **Step 2: Run the full test suite**

```bash
./vendor/bin/pest && npm run test
```

Expected: all passing.

- [ ] **Step 3: Type-check**

```bash
npm run types:check
```

Expected: no errors.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: clean build with no warnings about the new component.

- [ ] **Step 5: Manually verify in the browser**

Start the dev server (`npm run dev` + `php artisan serve`) and navigate to Settings → Connected Accounts. Type at least 2 characters into the Mastodon Instance URL field and confirm:
- Suggestions appear with domain name (bold) and description (muted, smaller)
- Clicking a suggestion fills the input with just the domain (e.g. `mastodon.social`)
- The form still submits correctly after selecting a suggestion
- Typing a custom domain not in the list still works

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/settings/connections.tsx
git commit -m "🖼️ Replace instance URL input with autocomplete combobox"
```
