<?php

use App\Models\Tombstone;
use App\Models\TombstoneRecoveryToken;
use Illuminate\Database\QueryException;

test('createForTombstone hashes the token and consume() stamps used_at', function () {
    $tombstone = Tombstone::factory()->create();

    $record = TombstoneRecoveryToken::createForTombstone($tombstone, 'raw-token-value');

    expect($record->token)->toBe(hash('sha256', 'raw-token-value'));
    expect($record->used_at)->toBeNull();

    $record->consume();

    expect($record->fresh()->used_at)->not->toBeNull();
});

test('deleting a tombstone cascades to its recovery tokens', function () {
    $tombstone = Tombstone::factory()->create();
    $record = TombstoneRecoveryToken::createForTombstone($tombstone, 'raw-token-value');

    $tombstone->delete();

    expect(TombstoneRecoveryToken::find($record->id))->toBeNull();
});

test('a duplicate hashed token violates the unique constraint', function () {
    $first = Tombstone::factory()->create();
    $second = Tombstone::factory()->create();

    TombstoneRecoveryToken::createForTombstone($first, 'same-raw-token');

    expect(fn () => TombstoneRecoveryToken::createForTombstone($second, 'same-raw-token'))
        ->toThrow(QueryException::class);
});
