<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Feed\FeedAggregator;
use App\Services\Feed\PostNormalizer;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

function callFetchMastodonStatuses(FeedAggregator $aggregator, SocialAccount $account, array $statuses, callable $idExtractor): array
{
    $method = new ReflectionMethod(FeedAggregator::class, 'fetchMastodonStatuses');

    return $method->invoke($aggregator, $account, $statuses, $idExtractor);
}

it('fetches missing statuses using the id extractor', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $statuses = [
        ['id' => '1', 'in_reply_to_id' => '99', 'content' => '<p>hi</p>'],
        ['id' => '2', 'in_reply_to_id' => null, 'content' => '<p>bye</p>'],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getStatus')
        ->once()
        ->with($account, '99')
        ->andReturn(['id' => '99', 'content' => '<p>parent</p>']);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        Mockery::mock(PostNormalizer::class),
    );

    $result = callFetchMastodonStatuses($aggregator, $account, $statuses, fn ($s) => $s['in_reply_to_id'] ?? null);

    expect($result)->toHaveKey('99')
        ->and($result['99']['id'])->toBe('99');
});

it('uses batch status instead of fetching when already present', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $statuses = [
        ['id' => '1', 'in_reply_to_id' => '2', 'content' => '<p>reply</p>'],
        ['id' => '2', 'in_reply_to_id' => null, 'content' => '<p>original</p>'],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldNotReceive('getStatus');

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        Mockery::mock(PostNormalizer::class),
    );

    $result = callFetchMastodonStatuses($aggregator, $account, $statuses, fn ($s) => $s['in_reply_to_id'] ?? null);

    expect($result)->toHaveKey('2')
        ->and($result['2']['id'])->toBe('2');
});

it('silently omits a status when getStatus returns null', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $statuses = [
        ['id' => '1', 'in_reply_to_id' => '99', 'content' => '<p>hi</p>'],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getStatus')
        ->once()
        ->with($account, '99')
        ->andReturn(null);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        Mockery::mock(PostNormalizer::class),
    );

    $result = callFetchMastodonStatuses($aggregator, $account, $statuses, fn ($s) => $s['in_reply_to_id'] ?? null);

    expect($result)->toBeEmpty();
});

it('extracts quote_id from within a reblogged status', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $statuses = [
        [
            'id' => '1',
            'in_reply_to_id' => null,
            'content' => '',
            'reblog' => [
                'id' => '2',
                'content' => '<p>boosted post that quotes</p>',
                'quote_id' => '99',
            ],
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getStatus')
        ->once()
        ->with($account, '99')
        ->andReturn(['id' => '99', 'content' => '<p>quoted post</p>']);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        Mockery::mock(PostNormalizer::class),
    );

    $result = callFetchMastodonStatuses($aggregator, $account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['quote_id'] ?? null);

    expect($result)->toHaveKey('99')
        ->and($result['99']['id'])->toBe('99');
});

it('fetches parent status from in_reply_to_id within a reblogged reply', function () {
    $account = SocialAccount::factory()->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $statuses = [
        [
            'id' => '300',
            'in_reply_to_id' => null,
            'content' => '',
            'reblog' => [
                'id' => '200',
                'in_reply_to_id' => '100',
                'content' => '<p>a reply that was boosted</p>',
            ],
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getStatus')
        ->once()
        ->with($account, '100')
        ->andReturn(['id' => '100', 'content' => '<p>original post</p>']);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        Mockery::mock(PostNormalizer::class),
    );

    $result = callFetchMastodonStatuses($aggregator, $account, $statuses, fn ($s) => ($s['reblog'] ?? $s)['in_reply_to_id'] ?? null);

    expect($result)->toHaveKey('100')
        ->and($result['100']['id'])->toBe('100');
});

it('passes reply_to to normalizer for a reblogged reply', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $parentUrl = 'https://fosstodon.org/@original/100';
    $reblog = [
        'id' => '300',
        'created_at' => '2026-06-01T12:00:00.000Z',
        'in_reply_to_id' => null,
        'account' => ['acct' => 'booster', 'display_name' => 'Booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '200',
            'in_reply_to_id' => '100',
            'created_at' => '2026-06-01T10:00:00.000Z',
            'url' => 'https://fosstodon.org/@author/200',
            'content' => '<p>reply that got boosted</p>',
            'account' => ['acct' => 'author', 'display_name' => 'Author', 'avatar' => 'https://fosstodon.org/author.png', 'header' => '', 'emojis' => []],
            'media_attachments' => [],
            'emojis' => [],
            'card' => null,
            'quote' => null,
            'quote_id' => null,
            'tags' => [],
        ],
    ];

    $parentStatus = [
        'id' => '100',
        'content' => '<p>original post</p>',
        'url' => $parentUrl,
        'created_at' => '2026-06-01T09:00:00.000Z',
        'account' => [
            'display_name' => 'Original Author',
            'acct' => 'original',
            'avatar' => 'https://fosstodon.org/original.png',
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$reblog]);
    $mastodon->shouldReceive('getStatus')->andReturnUsing(fn ($acct, $id) => $id === '100' ? $parentStatus : null);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        app(PostNormalizer::class),
    );

    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['reply_to'])->not->toBeNull()
        ->and($result['posts'][0]['reply_to']['author_name'])->toBe('Original Author')
        ->and($result['posts'][0]['reply_to']['original_url'])->toBe($parentUrl);
});

it('deduplicates posts with the same original_url, keeping the newest boost', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    // Two boosts of the same post — same original_url, different boost times
    $sharedUrl = 'https://fosstodon.org/@charlie/123';
    $newerBoost = [
        'id' => '200',
        'created_at' => '2026-06-02T12:00:00.000Z',
        'in_reply_to_id' => null,
        'reblog' => [
            'id' => '123',
            'created_at' => '2026-06-01T10:00:00.000Z',
            'url' => $sharedUrl,
            'content' => '<p>original</p>',
            'account' => ['acct' => 'charlie', 'display_name' => 'Charlie', 'avatar' => 'https://fosstodon.org/avatar.png', 'header' => '', 'emojis' => []],
            'media_attachments' => [],
            'emojis' => [],
            'card' => null,
            'quote' => null,
            'quote_id' => null,
        ],
        'account' => ['acct' => 'alice', 'display_name' => 'Alice', 'avatar' => 'https://fosstodon.org/alice.png', 'emojis' => []],
    ];
    $olderBoost = array_merge($newerBoost, [
        'id' => '201',
        'created_at' => '2026-06-02T11:00:00.000Z',
        'account' => ['acct' => 'bob', 'display_name' => 'Bob', 'avatar' => 'https://fosstodon.org/bob.png', 'emojis' => []],
    ]);

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$newerBoost, $olderBoost]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        app(PostNormalizer::class),
    );

    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['boosted_by'])->toBe('Alice')
        ->and($result['posts'][0]['original_url'])->toBe($sharedUrl);
});

it('respects per-account max_posts setting', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
        'feed_settings' => ['max_posts' => 3],
    ]);

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')
        ->with($account, 3, null)
        ->andReturn([]);
    $mastodon->shouldNotReceive('getStatus');

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $aggregator->fetch($user);
});

it('filters posts older than max_age_days when not boosted', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $oldDate = now()->subDays(10)->toIso8601String();
    $newDate = now()->subDays(2)->toIso8601String();

    $makeStatus = fn (string $id, string $date) => [
        'id' => $id,
        'created_at' => $date,
        'in_reply_to_id' => null,
        'url' => "https://fosstodon.org/@author/{$id}",
        'content' => "<p>post {$id}</p>",
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([
        $makeStatus('old', $oldDate),
        $makeStatus('new', $newDate),
    ]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['id'])->toBe('mastodon_new');
});

it('keeps boosted posts regardless of age', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $oldDate = now()->subDays(10)->toIso8601String();

    $boostedOldStatus = [
        'id' => '100',
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '50',
            'created_at' => $oldDate,
            'in_reply_to_id' => null,
            'url' => 'https://fosstodon.org/@author/50',
            'content' => '<p>old but boosted</p>',
            'spoiler_text' => '',
            'sensitive' => false,
            'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
            'media_attachments' => [],
            'emojis' => [],
            'card' => null,
            'quote' => null,
            'quote_id' => null,
            'tags' => [],
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$boostedOldStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['boosted_by'])->toBe('Booster');
});

it('uses per-account max_age_days override when set, ignoring user preference', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 3]]);
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
        'feed_settings' => ['max_age_days' => 14],
    ]);

    // Post is 10 days old — older than user preference (3 days) but within account override (14 days)
    $tenDaysAgo = now()->subDays(10)->toIso8601String();

    $status = [
        'id' => '1',
        'created_at' => $tenDaysAgo,
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@author/1',
        'content' => '<p>ten days old</p>',
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$status]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    // Should keep the post because account override (14 days) applies, not user preference (3 days)
    expect($result['posts'])->toHaveCount(1);
});

it('skips age filter when max_age_days is null', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $oldDate = now()->subDays(30)->toIso8601String();

    $oldStatus = [
        'id' => '1',
        'created_at' => $oldDate,
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@author/1',
        'content' => '<p>very old</p>',
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$oldStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1);
});

it('deduplicates cross-platform posts with similar body within 24h', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);

    $mastodonAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $blueskyAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $postTime = now()->toIso8601String();

    $mastodonStatus = [
        'id' => 'masto1',
        'created_at' => $postTime,
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@alice/masto1',
        'content' => '<p>This is a cross-posted message about interesting things happening in the world today.</p>',
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Alice', 'acct' => 'alice', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $blueskyPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz',
            'record' => [
                'text' => 'This is a cross-posted message about interesting things happening in the world today.',
                'createdAt' => $postTime,
            ],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [],
            'embed' => null,
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$mastodonStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => [$blueskyPost], 'cursor' => null]);

    $aggregator = new FeedAggregator($mastodon, $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1);
});

it('does not deduplicate similar posts older than 24h apart', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);

    $mastodonAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $blueskyAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $mastodonStatus = [
        'id' => 'masto2',
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@alice/masto2',
        'content' => '<p>This is a cross-posted message about interesting things happening in the world today.</p>',
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Alice', 'acct' => 'alice', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $blueskyPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/xyz2',
            'record' => [
                'text' => 'This is a cross-posted message about interesting things happening in the world today.',
                'createdAt' => now()->subDays(2)->toIso8601String(),
            ],
            'author' => ['displayName' => 'Alice', 'handle' => 'alice.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [],
            'embed' => null,
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$mastodonStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => [$blueskyPost], 'cursor' => null]);

    $aggregator = new FeedAggregator($mastodon, $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(2);
});

it('filters out posts containing muted words', function () {
    $user = User::factory()->create(['feed_preferences' => [
        'mute_words' => ['spam', 'giveaway'],
        'max_age_days' => null,
    ]]);
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $makeStatus = fn (string $id, string $body) => [
        'id' => $id,
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'url' => "https://fosstodon.org/@author/{$id}",
        'content' => "<p>{$body}</p>",
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([
        $makeStatus('1', 'This is a normal post'),
        $makeStatus('2', 'Win a prize in this GIVEAWAY today'),
        $makeStatus('3', 'Spam accounts are the worst'),
    ]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['id'])->toBe('mastodon_1');
});

it('skips mute word check when list is empty', function () {
    $user = User::factory()->create(['feed_preferences' => ['mute_words' => [], 'max_age_days' => null]]);
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $status = [
        'id' => '1',
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@author/1',
        'content' => '<p>Normal post</p>',
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$status]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1);
});
