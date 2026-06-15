# Sidebar Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inner SettingsLayout nav with a restructured main sidebar that surfaces all pages directly, removes the user dropdown, and adds a smart post-login redirect in place of the dashboard.

**Architecture:** A new `AppSidebarContents` component holds all sidebar nav (user info, platform group, settings group, logout), kept separate from the `<Sidebar>` shell so it can be reused in a Sheet panel later. The dashboard route stays but is backed by a `DashboardController` that redirects to Feed or Connections based on whether the user has accounts. Settings pages use plain `AppLayout` — the `SettingsLayout` wrapper is deleted.

**Tech Stack:** Laravel/Pest (backend), React/TypeScript with Inertia.js, Shadcn UI sidebar components, Lucide icons, Vitest (frontend tests)

---

### Task 1: DashboardController — smart redirect

**Files:**
- Create: `app/Http/Controllers/DashboardController.php`
- Modify: `routes/web.php`
- Modify: `tests/Feature/DashboardTest.php`

- [ ] **Step 1: Update DashboardTest to cover the new redirect behaviour**

Replace the contents of `tests/Feature/DashboardTest.php`:

```php
<?php

use App\Models\SocialAccount;
use App\Models\User;

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users with accounts are redirected to feed', function () {
    $user = User::factory()->withPasskey()->create();
    SocialAccount::factory()->create(['user_id' => $user->id]);
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('feed'));
});

test('authenticated users without accounts are redirected to connections', function () {
    $user = User::factory()->withPasskey()->create();
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('connections.edit'));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
php artisan test tests/Feature/DashboardTest.php
```

Expected: the two new redirect tests fail (route still renders dashboard page, not a redirect).

- [ ] **Step 3: Create DashboardController**

Create `app/Http/Controllers/DashboardController.php`:

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;

class DashboardController extends Controller
{
    public function __invoke(): RedirectResponse
    {
        if (auth()->user()->socialAccounts()->exists()) {
            return redirect()->route('feed');
        }

        return redirect()->route('connections.edit');
    }
}
```

- [ ] **Step 4: Update the dashboard route**

In `routes/web.php`, replace:
```php
Route::inertia('dashboard', 'dashboard')->name('dashboard');
```
with:
```php
Route::get('dashboard', \App\Http\Controllers\DashboardController::class)->name('dashboard');
```

Also add the `DashboardController` import at the top of the file with the other controller imports:
```php
use App\Http\Controllers\DashboardController;
```

Then update the route to use it:
```php
Route::get('dashboard', DashboardController::class)->name('dashboard');
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
php artisan test tests/Feature/DashboardTest.php
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Controllers/DashboardController.php routes/web.php tests/Feature/DashboardTest.php
git commit -m "🔄 Replace dashboard page with smart redirect controller"
```

---

### Task 2: NavMain — add label prop

**Files:**
- Modify: `resources/js/components/nav-main.tsx`

- [ ] **Step 1: Add optional `label` prop to NavMain**

Replace the contents of `resources/js/components/nav-main.tsx`:

```tsx
import { Link } from '@inertiajs/react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import type { NavItem } from '@/types';

export function NavMain({ items = [], label = 'Platform' }: { items: NavItem[]; label?: string }) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>{label}</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            isActive={isCurrentUrl(item.href)}
                            tooltip={{ children: item.title }}
                        >
                            <Link href={item.href} prefetch>
                                {item.icon && <item.icon />}
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors related to NavMain.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/nav-main.tsx
git commit -m "🔄 Add optional label prop to NavMain"
```

---

### Task 3: AppSidebarContents — extracted sidebar content component

**Files:**
- Create: `resources/js/components/app-sidebar-contents.tsx`

- [ ] **Step 1: Create the AppSidebarContents component**

Create `resources/js/components/app-sidebar-contents.tsx`:

```tsx
import { Link, router, usePage } from '@inertiajs/react';
import {
    CircleAlert,
    FolderGit2,
    LogOut,
    Palette,
    Rss,
    ShieldCheck,
    SlidersHorizontal,
    User,
    Users,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { UserInfo } from '@/components/user-info';
import {
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { feed, logout } from '@/routes';
import { edit as appearanceEdit } from '@/routes/appearance';
import { edit as connectionsEdit } from '@/routes/connections';
import { edit as feedSettingsEdit } from '@/routes/feed/settings';
import { edit as profileEdit } from '@/routes/profile';
import { edit as securityEdit } from '@/routes/security';
import type { NavItem } from '@/types';

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        href: 'https://github.com/aquarion/bloom',
        icon: FolderGit2,
    },
    {
        title: 'Report an issue',
        href: 'https://github.com/aquarion/bloom/issues/new',
        icon: CircleAlert,
    },
];

const platformNavItems: NavItem[] = [
    {
        title: 'Feed',
        href: feed(),
        icon: Rss,
    },
    {
        title: 'Accounts',
        href: connectionsEdit(),
        icon: Users,
    },
    {
        title: 'Feed Settings',
        href: feedSettingsEdit(),
        icon: SlidersHorizontal,
    },
];

const settingsNavItems: NavItem[] = [
    {
        title: 'Profile',
        href: profileEdit(),
        icon: User,
    },
    {
        title: 'Security',
        href: securityEdit(),
        icon: ShieldCheck,
    },
    {
        title: 'Appearance',
        href: appearanceEdit(),
        icon: Palette,
    },
];

export function AppSidebarContents() {
    const { auth, appVersion } = usePage().props;
    const cleanup = useMobileNavigation();

    const handleLogout = () => {
        cleanup();
        router.flushAll();
    };

    return (
        <>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={feed()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
                {auth.user && (
                    <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
                        <UserInfo user={auth.user} showEmail />
                    </div>
                )}
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={platformNavItems} />
                <NavMain items={settingsNavItems} label="Settings" />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                {appVersion && (
                    <div className="px-3 pb-1 text-neutral-500 text-xs group-data-[collapsible=icon]:hidden dark:text-neutral-400">
                        {appVersion.url ? (
                            <a
                                href={appVersion.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                            >
                                {appVersion.label}
                            </a>
                        ) : (
                            <span>{appVersion.label}</span>
                        )}
                    </div>
                )}
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link
                                href={logout()}
                                method="post"
                                as="button"
                                onClick={handleLogout}
                                data-test="logout-button"
                            >
                                <LogOut />
                                <span>Log out</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </>
    );
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no TypeScript errors (component not yet used, that's fine).

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/app-sidebar-contents.tsx
git commit -m "🎇 Add AppSidebarContents component with restructured nav"
```

---

### Task 4: AppSidebar — wire up AppSidebarContents

**Files:**
- Modify: `resources/js/components/app-sidebar.tsx`

- [ ] **Step 1: Replace AppSidebar body with AppSidebarContents**

Replace the contents of `resources/js/components/app-sidebar.tsx`:

```tsx
import { Sidebar } from '@/components/ui/sidebar';
import { AppSidebarContents } from '@/components/app-sidebar-contents';

export function AppSidebar() {
    return (
        <Sidebar collapsible="icon" variant="inset">
            <AppSidebarContents />
        </Sidebar>
    );
}
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add resources/js/components/app-sidebar.tsx
git commit -m "🔄 Wire AppSidebar to use AppSidebarContents"
```

---

### Task 5: Remove SettingsLayout

**Files:**
- Modify: `resources/js/app.tsx`
- Delete: `resources/js/layouts/settings/layout.tsx`

- [ ] **Step 1: Remove SettingsLayout from app.tsx**

Replace the contents of `resources/js/app.tsx`:

```tsx
import { createInertiaApp } from '@inertiajs/react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            case name === 'welcome':
            case name === 'feed':
                return null;
            case name.startsWith('auth/'):
                return AuthLayout;
            default:
                return AppLayout;
        }
    },
    strictMode: true,
    withApp(app) {
        return (
            <TooltipProvider delayDuration={0}>
                {app}
                <Toaster />
            </TooltipProvider>
        );
    },
    progress: {
        color: '#4B5563',
    },
});

// This will set light / dark mode on load...
initializeTheme();
```

- [ ] **Step 2: Delete the settings layout file**

```bash
rm resources/js/layouts/settings/layout.tsx
rmdir resources/js/layouts/settings
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: clean build (no references to SettingsLayout remain).

- [ ] **Step 4: Commit**

```bash
git add resources/js/app.tsx
git rm resources/js/layouts/settings/layout.tsx
git commit -m "❌ Remove SettingsLayout — settings pages now use plain AppLayout"
```

---

### Task 6: Delete dead frontend files

**Files:**
- Delete: `resources/js/pages/dashboard.tsx`
- Delete: `resources/js/components/nav-user.tsx`
- Delete: `resources/js/components/user-menu-content.tsx`

- [ ] **Step 1: Delete the three dead files**

```bash
rm resources/js/pages/dashboard.tsx
rm resources/js/components/nav-user.tsx
rm resources/js/components/user-menu-content.tsx
```

- [ ] **Step 2: Check TypeScript compiles**

```bash
npm run build 2>&1 | head -40
```

Expected: clean build. If any imports of the deleted files remain, the build will report them — fix any that appear.

- [ ] **Step 3: Run frontend tests**

```bash
npm test -- --run 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Run PHP tests**

```bash
php artisan test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git rm resources/js/pages/dashboard.tsx resources/js/components/nav-user.tsx resources/js/components/user-menu-content.tsx
git commit -m "❌ Delete dashboard page and user dropdown components"
```

---

### Task 7: Smoke test and close

- [ ] **Step 1: Start the dev server**

```bash
npm run dev &
```

- [ ] **Step 2: Verify key paths manually**

Check these in the browser:
- Sidebar shows Platform group: Feed, Accounts, Feed Settings
- Sidebar shows Settings group: Profile, Security, Appearance
- User name + email visible in sidebar header (hidden when sidebar is collapsed to icons)
- No "Settings" or "Dashboard" link in sidebar
- No user avatar dropdown — clicking user info area does nothing
- Log out button appears below Settings group in footer
- Navigating to `/dashboard` while logged in with accounts → redirects to `/feed`
- Navigating to `/dashboard` while logged in with no accounts → redirects to `/settings/connections`
- Settings pages (e.g. `/settings/profile`) render without the inner settings nav sidebar
- Sidebar icon-only (collapsed) mode shows tooltips for all items

- [ ] **Step 3: Final full test run**

```bash
php artisan test && npm test -- --run
```

Expected: all tests pass.
