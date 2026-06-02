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
