<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('redirects guests away from mastodon connect', function () {
    $response = $this->post('/auth/mastodon', ['instance_url' => 'https://fosstodon.org']);

    $response->assertRedirect('/login');
});

it('redirects to the mastodon oauth authorize url', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getAuthorizeUrl')
        ->once()
        ->andReturn('https://fosstodon.org/oauth/authorize?client_id=abc');
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->post('/auth/mastodon', ['instance_url' => 'https://fosstodon.org']);

    $response->assertRedirect('https://fosstodon.org/oauth/authorize?client_id=abc');
    $this->assertEquals('https://fosstodon.org', session('mastodon_instance'));
});

it('validates instance_url on redirect', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->post('/auth/mastodon', ['instance_url' => 'not-a-url']);

    $response->assertSessionHasErrors('instance_url');
});

it('saves a new mastodon account on callback', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')
        ->once()
        ->with('https://fosstodon.org')
        ->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')
        ->once()
        ->andReturn(['access_token' => 'tok', 'handle' => '@testuser@fosstodon.org']);
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://fosstodon.org', 'mastodon_oauth_state' => 'teststate'])
        ->get('/auth/mastodon/callback?code=authcode&state=teststate');

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'mastodon-connected');

    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'handle' => '@testuser@fosstodon.org',
        'instance_url' => 'https://fosstodon.org',
    ]);
});

it('allows connecting a second mastodon account on a different instance', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')->andReturn(['access_token' => 'tok', 'handle' => '@alice@mastodon.social']);
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://mastodon.social', 'mastodon_oauth_state' => 'state'])
        ->get('/auth/mastodon/callback?code=code&state=state');

    $response->assertSessionHas('status', 'mastodon-connected');
    $this->assertDatabaseCount('social_accounts', 2);
});

it('allows connecting accounts with the same handle on different instances', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')->andReturn(['access_token' => 'tok', 'handle' => '@alice@fosstodon.org']);
    $this->app->instance(MastodonOAuthService::class, $service);

    // Different instance, same handle — should succeed
    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://social.coop', 'mastodon_oauth_state' => 'state'])
        ->get('/auth/mastodon/callback?code=code&state=state');

    $response->assertSessionHas('status', 'mastodon-connected');
    $this->assertDatabaseCount('social_accounts', 2);
});

it('redirects with mastodon-already-connected for a duplicate instance and handle', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'handle' => '@alice@fosstodon.org',
    ]);

    $service = Mockery::mock(MastodonOAuthService::class);
    $service->shouldReceive('getStoredCredentials')->andReturn(['client_id' => 'cid', 'client_secret' => 'csecret']);
    $service->shouldReceive('exchangeCode')->andReturn(['access_token' => 'tok', 'handle' => '@alice@fosstodon.org']);
    $this->app->instance(MastodonOAuthService::class, $service);

    $response = $this->actingAs($user)
        ->withSession(['mastodon_instance' => 'https://fosstodon.org', 'mastodon_oauth_state' => 'state'])
        ->get('/auth/mastodon/callback?code=code&state=state');

    $response->assertSessionHas('status', 'mastodon-already-connected');
    $this->assertDatabaseCount('social_accounts', 1);
});

it('disconnects a specific mastodon account by id', function () {
    $user = User::factory()->create();
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

    $response = $this->actingAs($user)->delete("/auth/mastodon/{$first->id}");

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'mastodon-disconnected');
    $this->assertDatabaseMissing('social_accounts', ['id' => $first->id]);
    $this->assertDatabaseHas('social_accounts', ['id' => $second->id]);
});

it('returns 403 when attempting to disconnect another users mastodon account', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $othersAccount = SocialAccount::factory()->create([
        'user_id' => $other->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://mastodon.social',
    ]);

    $response = $this->actingAs($user)->delete("/auth/mastodon/{$othersAccount->id}");

    $response->assertForbidden();
    $this->assertDatabaseHas('social_accounts', ['id' => $othersAccount->id]);
});
