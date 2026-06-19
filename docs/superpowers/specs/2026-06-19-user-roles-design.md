# User Roles Design

**Date:** 2026-06-19

## Overview

Add a role system to the `users` table supporting three fixed roles: `admin`, `beta_tester`, and `subscriber`. Users can hold one or more roles simultaneously. Roles are used throughout the application via Laravel's standard authorization primitives (gates, middleware, Blade, Livewire/policies).

## Database

A single migration adds a `roles` JSON column to the `users` table:

- Column: `roles`, type `json`, nullable, default `[]`
- No new tables
- Valid values (`admin`, `beta_tester`, `subscriber`) are enforced at the application layer, not the database

## Application Layer

### Enum: `App\Enums\Role`

A backed string enum defining the valid role values:

- `Role::Admin` → `'admin'`
- `Role::BetaTester` → `'beta_tester'`
- `Role::Subscriber` → `'subscriber'`

### Trait: `App\Concerns\HasRoles`

Mixed into the `User` model. Provides:

| Method | Signature | Description |
|--------|-----------|-------------|
| `hasRole` | `hasRole(Role\|string $role): bool` | True if user has the given role |
| `hasAnyRole` | `hasAnyRole(Role\|string ...$roles): bool` | True if user has at least one of the given roles |
| `hasAllRoles` | `hasAllRoles(Role\|string ...$roles): bool` | True if user has all of the given roles |
| `addRole` | `addRole(Role\|string $role): void` | Adds a role (idempotent) |
| `removeRole` | `removeRole(Role\|string $role): void` | Removes a role (idempotent) |

Methods accept either a `Role` enum instance or its string value.

### User Model

- `roles` cast to `array`
- `HasRoles` trait applied
- `roles` is **not** mass-assignable (not added to `$fillable`)

## Authorization

Gates defined in `AuthServiceProvider` (or a dedicated provider):

```php
Gate::define('admin', fn (User $user) => $user->hasRole(Role::Admin));
Gate::define('beta_tester', fn (User $user) => $user->hasRole(Role::BetaTester));
Gate::define('subscriber', fn (User $user) => $user->hasRole(Role::Subscriber));
```

Usage across the stack:

- **Middleware:** `->middleware('can:admin')`
- **Blade:** `@can('beta_tester') ... @endcan`
- **Livewire/controllers:** `$this->authorize('subscriber')`
- **Gate check:** `Gate::allows('admin')`

## Beta Tester Profile Toggle

`beta_tester` is the only user-controllable role. The profile page exposes a toggle that calls a dedicated action (`UpdateBetaTesterPreference` or similar) which calls `addRole`/`removeRole` on the user. No eligibility check — free opt-in/opt-out.

`admin` and `subscriber` are assigned by developers via migrations, seeders, or direct database manipulation only.

## Out of Scope

- Admin UI for role management
- Permission granularity beyond role checks
- Additional roles beyond the three defined here
