<?php

namespace App\Concerns;

trait HasJsonPreferences
{
    public function getPreferences(): array
    {
        $column = $this->preferencesColumn;
        $stored = $this->$column ?? [];

        return array_merge($this->preferencesDefaults, is_array($stored) ? $stored : []);
    }

    public function getPreference(string $key, mixed $default = null): mixed
    {
        $prefs = $this->getPreferences();

        return array_key_exists($key, $prefs) ? $prefs[$key] : $default;
    }

    public function setPreference(string $key, mixed $value): void
    {
        $column = $this->preferencesColumn;
        $current = $this->getPreferences();
        $current[$key] = $value;
        $this->$column = $current;

        if (! $this->save()) {
            throw new \RuntimeException(
                sprintf('Failed to save preference "%s" on %s #%s', $key, static::class, $this->getKey())
            );
        }
    }
}
