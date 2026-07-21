<?php

use App\Models\SocialAccount;
use App\Models\User;

it('renders the feed settings page', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->withoutVite()->get(route('feed.settings.edit'));

    $response->assertInertia(fn ($page) => $page->component('settings/feed', false)
        ->has('preferences')
    );
});

it('updates user feed preferences', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->put(route('feed.settings.update'), [
        'max_age_days' => 14,
        'mute_words' => ['spam', 'giveaway'],
        'cw_behavior' => 'skip',
        'sensitive_media_behavior' => 'show',
        'cw_label_whitelist' => ['adult', 'safety', 'generic'],
        'cw_author_whitelist' => ['@alice@mastodon.social'],
    ]);

    $response->assertRedirect();

    $user->refresh();
    expect($user->getPreference('max_age_days'))->toBe(14)
        ->and($user->getPreference('mute_words'))->toBe(['spam', 'giveaway'])
        ->and($user->getPreference('cw_behavior'))->toBe('skip')
        ->and($user->getPreference('sensitive_media_behavior'))->toBe('show')
        ->and($user->getPreference('cw_label_whitelist'))->toBe(['adult', 'safety', 'generic'])
        ->and($user->getPreference('cw_author_whitelist'))->toBe(['@alice@mastodon.social']);
});

it('removes an author from cw_author_whitelist when omitted on update', function () {
    $user = User::factory()->withPasskey()->create([
        'feed_preferences' => ['cw_author_whitelist' => ['@alice@mastodon.social']],
    ]);

    $this->actingAs($user)->put(route('feed.settings.update'), [
        'max_age_days' => 14,
        'mute_words' => [],
        'cw_behavior' => 'blur',
        'sensitive_media_behavior' => 'show',
        'cw_label_whitelist' => [],
        'cw_author_whitelist' => [],
    ]);

    $user->refresh();
    expect($user->getPreference('cw_author_whitelist'))->toBe([]);
});

it('validates feed preferences input', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->put(route('feed.settings.update'), [
        'max_age_days' => 14,
        'mute_words' => [],
        'cw_behavior' => 'invalid_value',
        'sensitive_media_behavior' => 'show',
    ]);

    $response->assertSessionHasErrors('cw_behavior');
});

it('rejects an invalid cw_label_whitelist entry', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->put(route('feed.settings.update'), [
        'max_age_days' => 14,
        'mute_words' => [],
        'cw_behavior' => 'blur',
        'sensitive_media_behavior' => 'show',
        'cw_label_whitelist' => ['not-a-real-category'],
    ]);

    $response->assertSessionHasErrors('cw_label_whitelist.0');
});

it('redirects guests away from feed settings', function () {
    $this->get(route('feed.settings.edit'))->assertRedirect(route('login'));
});

it('adds an author to cw_author_whitelist', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->postJson(route('feed.settings.whitelist-author'), [
        'author_handle' => '@alice@mastodon.social',
    ]);

    $response->assertNoContent();

    $user->refresh();
    expect($user->getPreference('cw_author_whitelist'))->toBe(['@alice@mastodon.social']);
});

it('does not duplicate an author already in cw_author_whitelist', function () {
    $user = User::factory()->withPasskey()->create([
        'feed_preferences' => ['cw_author_whitelist' => ['@alice@mastodon.social']],
    ]);

    $this->actingAs($user)->postJson(route('feed.settings.whitelist-author'), [
        'author_handle' => '@alice@mastodon.social',
    ])->assertNoContent();

    $user->refresh();
    expect($user->getPreference('cw_author_whitelist'))->toBe(['@alice@mastodon.social']);
});

it('appends a second author to an existing cw_author_whitelist', function () {
    $user = User::factory()->withPasskey()->create([
        'feed_preferences' => ['cw_author_whitelist' => ['@alice@mastodon.social']],
    ]);

    $this->actingAs($user)->postJson(route('feed.settings.whitelist-author'), [
        'author_handle' => '@bob.bsky.social',
    ])->assertNoContent();

    $user->refresh();
    expect($user->getPreference('cw_author_whitelist'))->toBe(['@alice@mastodon.social', '@bob.bsky.social']);
});

it('requires author_handle to whitelist an author', function () {
    $user = User::factory()->withPasskey()->create();

    $this->actingAs($user)->postJson(route('feed.settings.whitelist-author'), [])
        ->assertJsonValidationErrors('author_handle');
});

it('rejects whitelisting an author for guests', function () {
    $this->postJson(route('feed.settings.whitelist-author'), [
        'author_handle' => '@alice@mastodon.social',
    ])->assertUnauthorized();
});

it('updates per-account feed settings', function () {
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $response = $this->actingAs($user)->put(
        route('connections.feed.update', ['account' => $account->id]),
        ['max_posts' => 10, 'max_age_days' => 3]
    );

    $response->assertRedirect(route('connections.edit'));

    $account->refresh();
    expect($account->getPreference('max_posts'))->toBe(10)
        ->and($account->getPreference('max_age_days'))->toBe(3);
});

it('rejects per-account feed settings update for another user account', function () {
    $user = User::factory()->withPasskey()->create();
    $other = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $other->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $this->actingAs($user)->put(
        route('connections.feed.update', ['account' => $account->id]),
        ['max_posts' => 10, 'max_age_days' => null]
    )->assertForbidden();
});

it('rejects invalid cw_behavior for updateAccount', function () {
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    // max_posts below minimum
    $this->actingAs($user)->put(
        route('connections.feed.update', ['account' => $account->id]),
        ['max_posts' => 0, 'max_age_days' => null]
    )->assertSessionHasErrors('max_posts');

    // max_posts above maximum
    $this->actingAs($user)->put(
        route('connections.feed.update', ['account' => $account->id]),
        ['max_posts' => 101, 'max_age_days' => null]
    )->assertSessionHasErrors('max_posts');
});

it('rejects invalid max_age_days for updateAccount', function () {
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    // max_age_days above maximum
    $this->actingAs($user)->put(
        route('connections.feed.update', ['account' => $account->id]),
        ['max_posts' => 20, 'max_age_days' => 366]
    )->assertSessionHasErrors('max_age_days');
});
