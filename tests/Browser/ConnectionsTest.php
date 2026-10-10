<?php

use App\Models\SocialAccount;
use App\Models\User;

test('connections page loads with provider sections', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user);

    visit('/settings/connections')
        ->assertPathIs('/settings/connections')
        ->assertSee('Mastodon')
        ->assertSee('Bluesky')
        ->assertNoJavaScriptErrors();
});

test('connected account is displayed with disconnect button', function (string $provider, string $instanceUrl, string $handle) {
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => $provider,
        'instance_url' => $instanceUrl,
        'handle' => $handle,
        'auth_failed_at' => null,
    ]);

    $this->actingAs($user);

    visit('/settings/connections')
        ->assertSeeIn("@account-{$account->id}", $handle)
        ->assertSeeIn("@account-{$account->id}", 'Disconnect')
        ->assertNoJavaScriptErrors();
})->with([
    'mastodon' => ['mastodon', 'https://fosstodon.org', '@alice@fosstodon.org'],
    'bluesky' => ['bluesky', 'https://bsky.social', '@alice.bsky.social'],
]);

test('multiple accounts for a provider all appear', function (string $provider, array $accounts) {
    $user = User::factory()->withPasskey()->create();

    foreach ($accounts as [$instanceUrl, $handle]) {
        SocialAccount::factory()->create([
            'user_id' => $user->id,
            'provider' => $provider,
            'instance_url' => $instanceUrl,
            'handle' => $handle,
            'auth_failed_at' => null,
        ]);
    }

    $this->actingAs($user);

    $page = visit('/settings/connections');

    foreach ($accounts as [, $handle]) {
        $page->assertSee($handle);
    }

    $page->assertNoJavaScriptErrors();
})->with([
    'mastodon' => ['mastodon', [
        ['https://fosstodon.org', '@alice@fosstodon.org'],
        ['https://mastodon.social', '@alice@mastodon.social'],
    ]],
    'bluesky' => ['bluesky', [
        ['https://bsky.social', '@alice.bsky.social'],
        ['https://bsky.social', '@work.bsky.social'],
    ]],
]);

test('disconnecting an account removes it and leaves others', function (string $provider, string $instanceUrl, string $keepHandle, string $removeHandle) {
    $user = User::factory()->withPasskey()->create();
    $keep = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => $provider,
        'instance_url' => $instanceUrl,
        'handle' => $keepHandle,
        'auth_failed_at' => null,
    ]);
    $remove = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => $provider,
        'instance_url' => $instanceUrl,
        'handle' => $removeHandle,
        'auth_failed_at' => null,
    ]);

    // Disconnecting is a passkey step-up action; a recent confirmation lets the
    // client skip the WebAuthn ceremony, which a headless browser can't complete.
    $this->actingAs($user)->withSession(['passkey_confirmed_at' => time()]);

    visit('/settings/connections')
        ->assertSee($removeHandle)
        ->click("[data-testid=\"account-{$remove->id}\"] button:has-text(\"Disconnect\")")
        ->assertDontSee($removeHandle)
        ->assertSee($keepHandle)
        ->assertNoJavaScriptErrors();

    expect(SocialAccount::find($remove->id))->toBeNull()
        ->and(SocialAccount::find($keep->id))->not->toBeNull();
})->with([
    'mastodon' => ['mastodon', 'https://fosstodon.org', '@keep@fosstodon.org', '@remove@fosstodon.org'],
    'bluesky' => ['bluesky', 'https://bsky.social', '@keep.bsky.social', '@remove.bsky.social'],
]);

test('account with auth_failed_at shows a reconnect warning', function (string $provider, string $instanceUrl, string $handle) {
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => $provider,
        'instance_url' => $instanceUrl,
        'handle' => $handle,
        'auth_failed_at' => now()->subDay(),
    ]);

    $this->actingAs($user);

    visit('/settings/connections')
        ->assertSeeIn("@account-{$account->id}", $handle)
        ->assertSeeIn("@account-{$account->id}", 'credentials expired')
        ->assertSeeIn("@account-{$account->id}", 'Reconnect')
        ->assertNoJavaScriptErrors();
})->with([
    'mastodon' => ['mastodon', 'https://fosstodon.org', '@stale@fosstodon.org'],
    'bluesky' => ['bluesky', 'https://bsky.social', '@stale.bsky.social'],
]);
