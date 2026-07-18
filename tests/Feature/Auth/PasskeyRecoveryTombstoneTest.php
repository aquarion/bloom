<?php

use App\Mail\TombstoneRecovery;
use App\Models\Tombstone;
use App\Models\TombstoneRecoveryToken;
use Illuminate\Support\Facades\Mail;
use Inertia\Testing\AssertableInertia;

test('recovery for a tombstoned email sends a tombstone-recovery email and redirects identically to a live account', function () {
    Mail::fake();

    $tombstone = Tombstone::factory()->create(['email' => 'ada@example.com']);

    $this->post(route('passkey.recover.store'), ['email' => 'ada@example.com'])
        ->assertRedirect(route('passkey.recover.sent'));

    Mail::assertSent(TombstoneRecovery::class, fn ($mail) => $mail->hasTo('ada@example.com'));
    expect(TombstoneRecoveryToken::where('tombstone_id', $tombstone->id)->count())->toBe(1);
});

test('a valid tombstone recovery token stashes tombstone_id and redirects to the archived interstitial', function () {
    $tombstone = Tombstone::factory()->create();
    TombstoneRecoveryToken::createForTombstone($tombstone, 'valid-tombstone-token');

    $this->get(route('passkey.recover.setup', 'valid-tombstone-token'))
        ->assertRedirect(route('tombstone.show'));

    expect(session('tombstone_id'))->toBe($tombstone->id);
    $this->assertGuest();
});

test('an expired tombstone recovery token shows the invalid page, same as an expired live-account token', function () {
    $tombstone = Tombstone::factory()->create();
    $record = TombstoneRecoveryToken::createForTombstone($tombstone, 'expired-tombstone-token');
    $record->created_at = now()->subHours(2);
    $record->save();

    $this->withoutVite()
        ->get(route('passkey.recover.setup', 'expired-tombstone-token'))
        ->assertOk()
        ->assertInertia(fn (AssertableInertia $page) => $page->component('auth/recover-invalid'));
});
