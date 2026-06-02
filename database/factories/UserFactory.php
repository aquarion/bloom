<?php

namespace Database\Factories;

use App\Models\Passkey;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
        ];
    }

    public function withPasskey(): static
    {
        return $this->afterCreating(function (User $user) {
            Passkey::factory()->for($user)->create();
        });
    }
}
