<?php

use App\Models\SocialAccount;
use App\Models\User;
use Laravel\Dusk\Browser;

test('connections page loads with provider sections', function () {
    $user = User::factory()->create();

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertPathIs('/settings/connections')
            ->assertSee('Mastodon')
            ->assertSee('Bluesky');
    });
});

test('connected mastodon account is displayed with disconnect button', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice@fosstodon.org')
            ->assertSee('Disconnect');
    });
});

test('connected bluesky account is displayed with disconnect button', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@alice.bsky.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice.bsky.social')
            ->assertSee('Disconnect');
    });
});

test('multiple mastodon accounts all appear', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'handle' => '@alice@mastodon.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice@fosstodon.org')
            ->assertSee('@alice@mastodon.social');
    });
});

test('multiple bluesky accounts all appear', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@alice.bsky.social',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@work.bsky.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@alice.bsky.social')
            ->assertSee('@work.bsky.social');
    });
});

test('disconnecting a mastodon account removes it and leaves others', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@keep@fosstodon.org',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'handle' => '@remove@mastodon.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@remove@mastodon.social');

        $browser->within('li:has(strong:contains("@remove@mastodon.social"))', function (Browser $li) {
            $li->press('Disconnect');
        });

        $browser->waitForLocation('/settings/connections')
            ->assertDontSee('@remove@mastodon.social')
            ->assertSee('@keep@fosstodon.org');
    });
});

test('disconnecting a bluesky account removes it and leaves others', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@keep.bsky.social',
        'auth_failed_at' => null,
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@remove.bsky.social',
        'auth_failed_at' => null,
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@remove.bsky.social');

        $browser->within('li:has(strong:contains("@remove.bsky.social"))', function (Browser $li) {
            $li->press('Disconnect');
        });

        $browser->waitForLocation('/settings/connections')
            ->assertDontSee('@remove.bsky.social')
            ->assertSee('@keep.bsky.social');
    });
});

test('account with auth_failed_at shows reconnect warning', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@stale.bsky.social',
        'auth_failed_at' => now()->subDay(),
    ]);

    $this->browse(function (Browser $browser) use ($user) {
        $browser->visit('/login')
            ->waitFor('#email')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        $browser->visit('/settings/connections')
            ->assertSee('@stale.bsky.social')
            ->assertSee('needs reconnecting');
    });
});
