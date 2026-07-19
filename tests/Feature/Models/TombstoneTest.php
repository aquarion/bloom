<?php

use App\Models\Tombstone;
use Carbon\CarbonInterface;

test('archived_passkeys and archived_social_accounts cast to arrays, tombstoned_at casts to datetime', function () {
    $tombstone = Tombstone::factory()->create([
        'archived_passkeys' => [['credential_id' => 'abc123']],
        'archived_social_accounts' => [['provider' => 'mastodon']],
    ]);

    expect($tombstone->archived_passkeys)->toBe([['credential_id' => 'abc123']]);
    expect($tombstone->archived_social_accounts)->toBe([['provider' => 'mastodon']]);
    expect($tombstone->tombstoned_at)->toBeInstanceOf(CarbonInterface::class);
});

test('CURRENT_SCHEMA_VERSION is 1', function () {
    expect(Tombstone::CURRENT_SCHEMA_VERSION)->toBe(1);
});
