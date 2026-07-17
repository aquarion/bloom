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
