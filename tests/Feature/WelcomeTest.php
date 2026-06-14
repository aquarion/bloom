<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

uses(RefreshDatabase::class);

function mastodonStatus(string $id, string $body): array
{
    return [
        'id' => $id,
        'content' => "<p>{$body}</p>",
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => "https://mastodon.social/@user/{$id}",
        'account' => [
            'display_name' => 'User',
            'acct' => 'user',
            'avatar' => '',
            'emojis' => [],
        ],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
        'in_reply_to_id' => null,
        'reblog' => null,
    ];
}

it('renders the welcome page for guests', function () {
    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response([]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->component('welcome', false)
            ->has('initialPosts')
            ->has('canRegister')
    );
});

it('redirects authenticated users to the feed', function () {
    $user = User::factory()->withPasskey()->create();
    $this->actingAs($user)->get('/')->assertRedirect(route('feed'));
});

it('passes normalised posts from the public timeline', function () {
    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response([
            mastodonStatus('1', 'Hello Fediverse'),
        ]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->component('welcome', false)
            ->where('initialPosts.0.source', 'mastodon')
            ->where('initialPosts.0.body', 'Hello Fediverse')
    );
});

it('filters out posts with an empty body', function () {
    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response([
            array_merge(mastodonStatus('1', ''), ['content' => '']),
            mastodonStatus('2', 'Has a body'),
        ]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->has('initialPosts', 1)
            ->where('initialPosts.0.body', 'Has a body')
    );
});

it('caches successfully fetched posts', function () {
    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response([
            mastodonStatus('99', 'Cacheable post'),
        ]),
    ]);

    $this->withoutVite()->get('/');

    expect(Cache::get('welcome.posts.data'))->not->toBeNull();
    expect(Cache::has('welcome.posts.fresh'))->toBeTrue();
});

it('serves a cached response on the second request without fetching again', function () {
    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response([
            mastodonStatus('1', 'First fetch'),
        ]),
    ]);

    $this->withoutVite()->get('/');
    $this->withoutVite()->get('/');

    Http::assertSentCount(1);
});

it('serves stale cache when the public timeline fetch fails', function () {
    $stale = [[
        'id' => 'mastodon_cached_1',
        'source' => 'mastodon',
        'source_handle' => '',
        'author_name' => 'Cached User',
        'author_handle' => '@cached@mastodon.social',
        'author_avatar' => '',
        'author_banner' => null,
        'body' => 'Stale cached body',
        'media' => [],
        'created_at' => '2024-01-01T00:00:00.000Z',
        'original_url' => '',
        'link_url' => null,
        'link_title' => null,
        'link_favicon' => null,
        'reply_to' => null,
        'quoted_post' => null,
        'boosted_by' => null,
        'boosted_by_avatar' => null,
        'boosted_by_handle' => null,
        'boosted_by_created_at' => null,
        'emojis' => [],
        'hashtags' => [],
    ]];

    Cache::put('welcome.posts.data', $stale, now()->addDays(7));
    // Omit 'welcome.posts.fresh' so freshness is expired

    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response(null, 500),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->where('initialPosts.0.id', 'mastodon_cached_1')
    );
});

it('falls back to hardcoded posts when cache is empty and fetch fails', function () {
    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response(null, 500),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->component('welcome', false)->has('initialPosts')
    );

    expect(Cache::get('welcome.posts.data'))->toBeNull();
});

it('falls back to hardcoded posts when all fetched posts are filtered out and cache is empty', function () {
    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response([
            array_merge(mastodonStatus('1', ''), ['content' => '']),
        ]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->component('welcome', false)->has('initialPosts')
    );

    expect(Cache::get('welcome.posts.data'))->toBeNull();
    expect(Cache::has('welcome.posts.fresh'))->toBeFalse();
});

it('serves stale cache when all fetched posts are filtered out', function () {
    $stale = [[
        'id' => 'mastodon_cached_1',
        'source' => 'mastodon',
        'source_handle' => '',
        'author_name' => 'Cached User',
        'author_handle' => '@cached@mastodon.social',
        'author_avatar' => '',
        'author_banner' => null,
        'body' => 'Stale cached body',
        'media' => [],
        'created_at' => '2024-01-01T00:00:00.000Z',
        'original_url' => '',
        'link_url' => null,
        'link_title' => null,
        'link_favicon' => null,
        'reply_to' => null,
        'quoted_post' => null,
        'boosted_by' => null,
        'boosted_by_avatar' => null,
        'boosted_by_handle' => null,
        'boosted_by_created_at' => null,
        'emojis' => [],
        'hashtags' => [],
    ]];

    Cache::put('welcome.posts.data', $stale, now()->addDays(7));
    // Omit 'welcome.posts.fresh' so freshness is expired

    Http::fake([
        config('feed.welcome_instance').'/api/v1/timelines/public*' => Http::response([
            array_merge(mastodonStatus('1', ''), ['content' => '']),
        ]),
    ]);

    $this->withoutVite()->get('/')->assertInertia(
        fn ($page) => $page->where('initialPosts.0.id', 'mastodon_cached_1')
    );
});
