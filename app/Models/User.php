<?php

namespace App\Models;

use App\Concerns\HasJsonPreferences;
use App\Concerns\HasRoles;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable(['name', 'email', 'feed_preferences'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, HasJsonPreferences, HasRoles, Notifiable;

    protected string $preferencesColumn = 'feed_preferences';

    protected array $preferencesDefaults = [
        'mute_words' => [],
        'max_age_days' => 7,
        'cw_behavior' => 'blur',
        'sensitive_media_behavior' => 'blur',
    ];

    protected $casts = [
        'feed_preferences' => 'array',
        'roles' => 'array',
    ];

    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value) => strtolower($value));
    }

    /** @return HasMany<SocialAccount, $this> */
    public function socialAccounts(): HasMany
    {
        return $this->hasMany(SocialAccount::class);
    }

    /** @return HasMany<Passkey, $this> */
    public function passkeys(): HasMany
    {
        return $this->hasMany(Passkey::class);
    }
}
