<?php

use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('returns false when user has no roles', function () {
    $user = User::factory()->create();

    expect($user->hasRole(Role::Admin))->toBeFalse();
});

it('returns true when user has the role', function () {
    $user = User::factory()->create(['roles' => ['admin']]);

    expect($user->hasRole(Role::Admin))->toBeTrue();
    expect($user->hasRole('admin'))->toBeTrue();
});

it('returns false for a role the user does not have', function () {
    $user = User::factory()->create(['roles' => ['admin']]);

    expect($user->hasRole(Role::BetaTester))->toBeFalse();
});

it('hasAnyRole returns true when user has at least one matching role', function () {
    $user = User::factory()->create(['roles' => ['beta_tester']]);

    expect($user->hasAnyRole(Role::Admin, Role::BetaTester))->toBeTrue();
});

it('hasAnyRole returns false when user has none of the given roles', function () {
    $user = User::factory()->create(['roles' => ['subscriber']]);

    expect($user->hasAnyRole(Role::Admin, Role::BetaTester))->toBeFalse();
});

it('hasAllRoles returns true when user has all given roles', function () {
    $user = User::factory()->create(['roles' => ['admin', 'beta_tester']]);

    expect($user->hasAllRoles(Role::Admin, Role::BetaTester))->toBeTrue();
});

it('hasAllRoles returns false when user is missing one of the roles', function () {
    $user = User::factory()->create(['roles' => ['admin']]);

    expect($user->hasAllRoles(Role::Admin, Role::BetaTester))->toBeFalse();
});

it('addRole persists the role to the database', function () {
    $user = User::factory()->create();
    $user->addRole(Role::Admin);

    expect($user->fresh()->hasRole(Role::Admin))->toBeTrue();
});

it('addRole is idempotent', function () {
    $user = User::factory()->create(['roles' => ['admin']]);
    $user->addRole(Role::Admin);

    expect($user->fresh()->roles)->toBe(['admin']);
});

it('removeRole removes the role and persists', function () {
    $user = User::factory()->create(['roles' => ['admin', 'beta_tester']]);
    $user->removeRole(Role::Admin);

    $fresh = $user->fresh();
    expect($fresh->hasRole(Role::Admin))->toBeFalse();
    expect($fresh->hasRole(Role::BetaTester))->toBeTrue();
});

it('removeRole is idempotent when role is not present', function () {
    $user = User::factory()->create(['roles' => ['admin']]);
    $user->removeRole(Role::BetaTester);

    expect($user->fresh()->roles)->toBe(['admin']);
});
