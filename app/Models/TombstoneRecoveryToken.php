<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TombstoneRecoveryToken extends Model
{
    protected $fillable = ['tombstone_id'];

    protected function casts(): array
    {
        return ['used_at' => 'datetime'];
    }

    public static function createForTombstone(Tombstone $tombstone, string $rawToken): self
    {
        $record = new self;
        $record->tombstone_id = $tombstone->id;
        $record->token = hash('sha256', $rawToken);
        $record->save();

        return $record;
    }

    public function consume(): void
    {
        $this->used_at = now();
        $this->save();
    }

    /** @return BelongsTo<Tombstone, $this> */
    public function tombstone(): BelongsTo
    {
        return $this->belongsTo(Tombstone::class);
    }
}
