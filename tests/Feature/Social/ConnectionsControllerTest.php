<?php

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('disconnects a bluesky account by id', function () {
    $user = User::factory()->withPasskey()->create();
    $first = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@first.bsky.social',
    ]);
    $second = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@second.bsky.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/connections/{$first->id}");

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-disconnected');
    $this->assertDatabaseMissing('social_accounts', ['id' => $first->id]);
    $this->assertDatabaseHas('social_accounts', ['id' => $second->id]);
});

it('disconnects a mastodon account by id', function () {
    $user = User::factory()->withPasskey()->create();
    $first = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@first@fosstodon.org',
    ]);
    $second = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
        'handle' => '@first@mastodon.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/connections/{$first->id}");

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'mastodon-disconnected');
    $this->assertDatabaseMissing('social_accounts', ['id' => $first->id]);
    $this->assertDatabaseHas('social_accounts', ['id' => $second->id]);
});

it('returns 403 when disconnecting another users account', function () {
    $user = User::factory()->withPasskey()->create();
    $other = User::factory()->withPasskey()->create();
    $othersAccount = SocialAccount::factory()->create([
        'user_id' => $other->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/connections/{$othersAccount->id}");

    $response->assertForbidden();
    $this->assertDatabaseHas('social_accounts', ['id' => $othersAccount->id]);
});

it('redirects guests away from disconnect', function () {
    $account = SocialAccount::factory()->create([
        'instance_url' => 'https://bsky.social',
    ]);

    $response = $this->delete("/auth/connections/{$account->id}");

    $response->assertRedirect('/login');
});

it('adds a public mastodon instance', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->post('/auth/connections/public-mastodon', [
        'instance_url' => 'https://social.example',
    ]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'public-mastodon-added');
    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'feed_type' => 'public_mastodon',
        'instance_url' => 'https://social.example',
    ]);
});

it('rejects private/loopback instance URLs to prevent SSRF', function () {
    $user = User::factory()->withPasskey()->create();

    foreach (['https://127.0.0.1', 'https://192.168.1.1', 'https://10.0.0.1', 'https://169.254.169.254'] as $url) {
        $response = $this->actingAs($user)->post('/auth/connections/public-mastodon', [
            'instance_url' => $url,
        ]);
        $response->assertSessionHasErrors('instance_url');
    }

    $this->assertDatabaseCount('social_accounts', 0);
});

it('rejects duplicate public mastodon instance', function () {
    $user = User::factory()->withPasskey()->create();
    SocialAccount::factory()->publicMastodon('https://social.example')->create(['user_id' => $user->id]);

    $response = $this->actingAs($user)->post('/auth/connections/public-mastodon', [
        'instance_url' => 'https://social.example',
    ]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'public-mastodon-already-added');
    $this->assertDatabaseCount('social_accounts', 1);
});

it('adds a bluesky algorithmic feed', function () {
    $user = User::factory()->withPasskey()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);

    $response = $this->actingAs($user)->post('/auth/connections/bluesky-feed', [
        'feed_url' => 'https://bsky.app/profile/did:plc:test/feed/whats-hot',
    ]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-feed-added');
    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'bluesky_feed',
    ]);
});

it('rejects bluesky feed without a home account', function () {
    $user = User::factory()->withPasskey()->create();

    $response = $this->actingAs($user)->post('/auth/connections/bluesky-feed', [
        'feed_url' => 'https://bsky.app/profile/did:plc:test/feed/whats-hot',
    ]);

    $response->assertSessionHasErrors('feed_url');
    $this->assertDatabaseCount('social_accounts', 0);
});
