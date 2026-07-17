<?php

namespace App\Models;

use Database\Factories\TombstoneFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Tombstone extends Model
{
    /** @use HasFactory<TombstoneFactory> */
    use HasFactory;

    /**
     * Tags the shape of archived_passkeys/archived_social_accounts at write
     * time. Bump this whenever that shape changes, and switch on it in any
     * code that reads the JSON back (rehydrate(), the passkey-login fallback).
     */
    public const CURRENT_SCHEMA_VERSION = 1;

    protected $fillable = [
        'email',
        'name',
        'schema_version',
        'archived_passkeys',
        'archived_social_accounts',
        'original_user_id',
        'tombstoned_at',
    ];

    protected function casts(): array
    {
        return [
            'schema_version' => 'integer',
            'archived_passkeys' => 'array',
            'archived_social_accounts' => 'array',
            'tombstoned_at' => 'datetime',
        ];
    }

    // recoveryTokens() relation is added in the TombstoneRecoveryToken task,
    // once that model exists (Larastan can't resolve a forward reference).
}
