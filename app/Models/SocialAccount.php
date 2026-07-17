<?php

namespace App\Models;

use App\Concerns\HasJsonPreferences;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use RuntimeException;

class SocialAccount extends Model
{
    use HasFactory, HasJsonPreferences;

    protected $fillable = [
        'user_id', 'provider', 'feed_type', 'instance_url',
        'access_token', 'token_secret', 'handle',
        'auth_failed_at', 'feed_settings',
    ];

    protected $hidden = ['access_token', 'token_secret'];

    protected $casts = [
        'access_token' => 'encrypted',  // pragma: allowlist secret
        'token_secret' => 'encrypted',  // pragma: allowlist secret
        'auth_failed_at' => 'datetime',
        'feed_settings' => 'array',
    ];

    protected string $preferencesColumn = 'feed_settings';

    protected array $preferencesDefaults = [
        'max_posts' => 20,
        'max_age_days' => null,
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array{provider: string, feed_type: string, instance_url: ?string, handle: ?string} */
    public function toArchive(): array
    {
        return [
            'provider' => $this->provider,
            'feed_type' => $this->feed_type,
            'instance_url' => $this->instance_url,
            'handle' => $this->handle,
        ];
    }

    /**
     * Build fillable attributes for a fresh SocialAccount::create() call from an
     * archived Tombstone entry. Never restores a token — resurrected accounts
     * always reauth, per the tombstones design. Switches on the owning
     * Tombstone's schema_version so a shape this code doesn't recognise fails
     * loudly instead of being silently misread.
     *
     * @param  array<string, mixed>  $archived
     * @return array<string, mixed>
     */
    public static function rehydrate(array $archived, int $schemaVersion): array
    {
        if ($schemaVersion !== Tombstone::CURRENT_SCHEMA_VERSION) {
            throw new RuntimeException("Unrecognised social-account archive schema version: {$schemaVersion}");
        }

        return [
            'provider' => $archived['provider'],
            'feed_type' => $archived['feed_type'],
            'instance_url' => $archived['instance_url'],
            'handle' => $archived['handle'],
            'auth_failed_at' => now(),
        ];
    }
}
