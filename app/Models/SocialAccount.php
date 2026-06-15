<?php

namespace App\Models;

use App\Concerns\HasJsonPreferences;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SocialAccount extends Model
{
    use HasFactory, HasJsonPreferences;

    protected $fillable = [
        'user_id', 'provider', 'instance_url',
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
}
