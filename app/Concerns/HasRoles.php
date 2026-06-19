<?php

namespace App\Concerns;

use App\Enums\Role;

trait HasRoles
{
    public function hasRole(Role|string $role): bool
    {
        $value = $role instanceof Role ? $role->value : $role;

        return in_array($value, $this->roles ?? [], true);
    }

    public function hasAnyRole(Role|string ...$roles): bool
    {
        foreach ($roles as $role) {
            if ($this->hasRole($role)) {
                return true;
            }
        }

        return false;
    }

    public function hasAllRoles(Role|string ...$roles): bool
    {
        foreach ($roles as $role) {
            if (! $this->hasRole($role)) {
                return false;
            }
        }

        return true;
    }

    public function addRole(Role|string $role): void
    {
        $value = $role instanceof Role ? $role->value : $role;
        $roles = $this->roles ?? [];

        if (! in_array($value, $roles, true)) {
            $roles[] = $value;
            $this->roles = $roles;
            $this->save();
        }
    }

    public function removeRole(Role|string $role): void
    {
        $value = $role instanceof Role ? $role->value : $role;
        $current = $this->roles ?? [];

        if (! in_array($value, $current, true)) {
            return;
        }

        $this->roles = array_values(array_filter($current, fn ($r) => $r !== $value));
        $this->save();
    }
}
