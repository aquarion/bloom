<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyAuthService;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\RequestException;

uses(RefreshDatabase::class);

it('redirects guests away from bluesky connect', function () {
    $response = $this->post('/auth/bluesky', ['handle' => 'test.bsky.social', 'app_password' => 'xxxx-xxxx']);

    $response->assertRedirect('/login');
});

it('saves a new bluesky account and redirects on store', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')
        ->once()
        ->with('test.bsky.social', 'xxxx-xxxx', 'https://bsky.social')
        ->andReturn([
            'access_token' => 'access-jwt',
            'refresh_token' => 'refresh-jwt',
            'handle' => '@test.bsky.social',
        ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'test.bsky.social',
        'app_password' => 'xxxx-xxxx',
    ]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-connected');

    $this->assertDatabaseHas('social_accounts', [
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'handle' => '@test.bsky.social',
        'instance_url' => 'https://bsky.social',
    ]);
});

it('saves a bluesky account with a custom PDS url', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')
        ->once()
        ->with('alice.example.com', 'xxxx-xxxx', 'https://example.com')
        ->andReturn([
            'access_token' => 'access-jwt',
            'refresh_token' => 'refresh-jwt',
            'handle' => '@alice.example.com',
        ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'alice.example.com',
        'app_password' => 'xxxx-xxxx',
        'pds_url' => 'https://example.com',
    ]);

    $this->assertDatabaseHas('social_accounts', [
        'provider' => 'bluesky',
        'instance_url' => 'https://example.com',
    ]);
});

it('allows connecting a second bluesky account with a different handle', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@first.bsky.social',
    ]);

    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')->andReturn([
        'access_token' => 'access-jwt',
        'refresh_token' => 'refresh-jwt',
        'handle' => '@second.bsky.social',
    ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'second.bsky.social',
        'app_password' => 'xxxx-xxxx',
    ]);

    $response->assertSessionHas('status', 'bluesky-connected');
    $this->assertDatabaseCount('social_accounts', 2);
});

it('redirects with bluesky-already-connected for a duplicate handle', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'instance_url' => 'https://bsky.social',
        'handle' => '@test.bsky.social',
    ]);

    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')->andReturn([
        'access_token' => 'access-jwt',
        'refresh_token' => 'refresh-jwt',
        'handle' => '@test.bsky.social',
    ]);
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'test.bsky.social',
        'app_password' => 'xxxx-xxxx',
    ]);

    $response->assertRedirect(route('connections.edit'));
    $response->assertSessionHas('status', 'bluesky-already-connected');
    $this->assertDatabaseCount('social_accounts', 1);
});

it('rejects a non-https pds_url', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'alice.bsky.social',
        'app_password' => 'xxxx-xxxx',
        'pds_url' => 'http://evil.example.com',
    ]);

    $response->assertSessionHasErrors('pds_url');
});

it('validates handle and app_password on store', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/auth/bluesky', []);

    $response->assertSessionHasErrors(['handle', 'app_password']);
});

it('returns a validation error on invalid credentials', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')
        ->once()
        ->andThrow(new RequestException(
            new Illuminate\Http\Client\Response(
                new Response(401, [], json_encode([
                    'error' => 'AuthenticationRequired',
                    'message' => 'Invalid identifier or password',
                ]))
            )
        ));
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'test.bsky.social',
        'app_password' => 'wrong-password', // pragma: allowlist secret
    ]);

    $response->assertSessionHasErrors('app_password');
});

it('returns a validation error on a failed bluesky connection', function () {
    $user = User::factory()->create();
    $service = Mockery::mock(BlueskyAuthService::class);
    $service->shouldReceive('createSession')
        ->once()
        ->andThrow(new RequestException(
            new Illuminate\Http\Client\Response(
                new Response(500, [], '{}')
            )
        ));
    $this->app->instance(BlueskyAuthService::class, $service);

    $response = $this->actingAs($user)->post('/auth/bluesky', [
        'handle' => 'test.bsky.social',
        'app_password' => 'xxxx-xxxx',
    ]);

    $response->assertSessionHasErrors('app_password');
});
