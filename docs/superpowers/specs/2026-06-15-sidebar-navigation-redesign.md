# Sidebar Navigation Redesign

**Date:** 2026-06-15
**Status:** Approved

## Overview

Remove the inner settings layout/navigation chrome and integrate all pages directly into the main sidebar. Eliminate the dashboard page in favour of a smart post-login redirect. Remove the user dropdown in favour of static user info in the sidebar header.

## Motivation

The current app has two layers of navigation for settings pages: the main sidebar (with a single "Settings" link) and an inner settings sidebar (Profile, Security, Appearance, Connections, Feed). This is redundant. With the sidebar redesign, all destinations are first-class sidebar items and no inner nav is needed.

## Final Sidebar Structure

### Header
- App logo + name (as now)
- Static user info row: avatar, name, email — no dropdown, no interactivity

### Platform group
- Dashboard → **removed**
- Feed
- Accounts (unchanged, points to `/settings/connections`)
- Feed Settings (moved from `/settings/feed`, keeps its route)

### Settings group (new)
- Profile
- Security
- Appearance

### Footer
- Repository link (unchanged)
- Report an issue link (unchanged)
- Log out (moved from user dropdown, direct Inertia link)

## Removed Elements

- **SettingsLayout** (`layouts/settings/layout.tsx`) — deleted entirely
- **Dashboard page** (`pages/dashboard.tsx`) — deleted
- **NavUser component** (`components/nav-user.tsx`) — deleted
- **UserMenuContent component** (`components/user-menu-content.tsx`) — deleted
- **"Settings" nav item** in AppSidebar mainNavItems — removed
- **`settings/*` layout rule** in `app.tsx` — settings pages revert to plain `AppLayout`

## Smart Redirect (replaces Dashboard)

The `dashboard` named route is kept (post-login redirects point to it) but backed by a new controller instead of `Route::inertia`.

**`App\Http\Controllers\DashboardController`** (new):
```php
public function __invoke(): RedirectResponse
{
    if (auth()->user()->socialAccounts()->exists()) {
        return redirect()->route('feed');
    }
    return redirect()->route('connections.edit');
}
```

Route change in `routes/web.php`:
```php
// Before:
Route::inertia('dashboard', 'dashboard')->name('dashboard');

// After:
Route::get('dashboard', DashboardController::class)->name('dashboard');
```

## Frontend Changes

### `app-sidebar-contents.tsx` (new)
Extract all sidebar content into a standalone component `AppSidebarContents` that renders:
- User info (avatar, name, email)
- Platform nav group
- Settings nav group
- Footer links + Log out

This component has no dependency on the Shadcn `<Sidebar>` shell, so it can be reused inside a `<Sheet>` panel on the feed page (issue #86) without duplicating nav structure.

### `app-sidebar.tsx`
- Replace `mainNavItems` array: remove Settings entry, add Feed Settings entry
- Add a second `NavMain`-style group for Settings items (Profile, Security, Appearance) — or a new `NavSettings` component
- Replace `<NavUser />` in SidebarFooter with static user info display
- Add Log out link in SidebarFooter
- Render `<AppSidebarContents />` inside the `<Sidebar>` shell rather than inlining everything

### `app-sidebar.tsx` — `SidebarHeader` block
- Add user info (avatar, name, email) below the existing logo/app-name row, inside the existing `<SidebarHeader>` JSX in `AppSidebar`
- `app-sidebar-header.tsx` is the breadcrumbs bar in the main content area — leave it untouched

### `nav-user.tsx`
- Delete

### `user-menu-content.tsx`
- Delete

### `layouts/settings/layout.tsx`
- Delete

### `app.tsx`
- Remove `case name.startsWith('settings/')` branch (or simplify it to just return `AppLayout`)

### `pages/dashboard.tsx`
- Delete

## Route Cleanup

- `/settings` already redirects to `/settings/profile` — keep as-is
- All settings page routes (`/settings/profile`, `/settings/security`, `/settings/appearance`, `/settings/connections`, `/settings/feed`) are unchanged
- `dashboard` named route is kept, now backed by DashboardController

## NavMain Grouping

The sidebar will have two `SidebarGroup` blocks inside `SidebarContent`:
1. **Platform** — Feed, Accounts, Feed Settings (label: "Platform")
2. **Settings** — Profile, Security, Appearance (label: "Settings")

`NavMain` currently renders a single group. Either:
- Call `NavMain` twice with different `items` and `label` props, or
- Keep `NavMain` for Platform and add a new `NavSettings` component for the Settings group

Preference: extend `NavMain` to accept an optional `label` prop (default `"Platform"`), call it twice.

## User Info in Sidebar Header

Replace `NavUser` (dropdown) with a static `UserInfo` render in the `SidebarHeader`, showing:
- Avatar (existing `UserInfo` component handles this)
- Name
- Email

No interactivity — clicking does nothing. Log out is in the footer instead.

## Testing

- Visiting `/dashboard` while logged in with accounts → redirects to `/feed`
- Visiting `/dashboard` while logged in with no accounts → redirects to `/settings/connections`
- Settings pages render without inner nav sidebar
- All sidebar links navigate correctly
- Sidebar collapsed (icon-only) mode still works: tooltips show for all items
- Log out works from footer link
