<?php

use App\Mail\TombstoneRecovery;
use App\Models\Tombstone;

test('mailable has the expected subject and renders the recovery url', function () {
    $tombstone = Tombstone::factory()->make(['name' => 'Ada Lovelace']);

    $mailable = new TombstoneRecovery($tombstone, 'https://bloom.test/recover/abc123');

    expect($mailable->envelope()->subject)->toBe('Your account was archived');
    expect($mailable->render())->toContain('https://bloom.test/recover/abc123');
    expect($mailable->render())->toContain('Ada Lovelace');
});
