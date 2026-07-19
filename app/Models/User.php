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

#[Fillable(['name', 'email', 'feed_preferences', 'last_active_at', 'inactivity_warning_sent_at'])]
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
        'cw_label_whitelist' => [],
    ];

    protected $casts = [
        'feed_preferences' => 'array',
        'roles' => 'array',
        'last_active_at' => 'datetime',
        'inactivity_warning_sent_at' => 'datetime',
    ];

    protected $appends = ['avatar'];

    protected function email(): Attribute
    {
        return Attribute::make(set: fn (string $value) => strtolower($value));
    }

    protected function avatar(): Attribute
    {
        return Attribute::make(
            get: fn () => 'https://www.gravatar.com/avatar/'.hash('sha256', strtolower(trim($this->email))).'?s=128&d=404',
        );
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

    /**
     * Cancel any active subscription for this user.
     *
     * No-op today — this application has no billing/subscription system yet.
     * Wired in ahead of time so account-tombstoning has a real hook to call
     * once billing exists, without needing to touch the tombstoning command.
     */
    public function cancelSubscription(): void
    {
        //
    }

    /**
     * Whether this user currently has a paid subscription.
     *
     * No-op today; see cancelSubscription().
     */
    public function isSubscribed(): bool
    {
        return false;
    }
}
