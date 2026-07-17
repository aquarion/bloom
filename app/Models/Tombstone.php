<?php

namespace App\Models;

use Database\Factories\TombstoneFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

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

    /** @return HasMany<TombstoneRecoveryToken, $this> */
    public function recoveryTokens(): HasMany
    {
        return $this->hasMany(TombstoneRecoveryToken::class);
    }

    /**
     * Type-safe accessor for the archived_passkeys JSON column, so callers
     * don't have to work with the loosely-typed `array` cast directly.
     *
     * @return array<int, array{credential_id: string, public_key: string, sign_count: int, transports: array<int, string>, name: string}>
     */
    public function archivedPasskeys(): array
    {
        /** @var array<int, array{credential_id: string, public_key: string, sign_count: int, transports: array<int, string>, name: string}> */
        return $this->archived_passkeys;
    }

    /**
     * Find a single archived passkey by its credential ID.
     *
     * @return array{credential_id: string, public_key: string, sign_count: int, transports: array<int, string>, name: string}|null
     */
    public function findArchivedPasskey(string $credentialId): ?array
    {
        return collect($this->archivedPasskeys())->firstWhere('credential_id', $credentialId);
    }

    /**
     * Type-safe accessor for the archived_social_accounts JSON column.
     *
     * @return array<int, array<string, mixed>>
     */
    public function archivedSocialAccounts(): array
    {
        /** @var array<int, array<string, mixed>> */
        return $this->archived_social_accounts;
    }
}
