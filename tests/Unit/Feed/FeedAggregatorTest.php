<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Feed\FeedAggregator;
use App\Services\Feed\PostNormalizer;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
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
    $recentDate = now()->subDays(2)->toIso8601String();
    $reblog = [
        'id' => '300',
        'created_at' => $recentDate,
        'in_reply_to_id' => null,
        'account' => ['acct' => 'booster', 'display_name' => 'Booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '200',
            'in_reply_to_id' => '100',
            'created_at' => $recentDate,
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
        'created_at' => $recentDate,
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
    $newerBoostTime = now()->subMinutes(5)->toIso8601String();
    $olderBoostTime = now()->subMinutes(10)->toIso8601String();
    $newerBoost = [
        'id' => '200',
        'created_at' => $newerBoostTime,
        'in_reply_to_id' => null,
        'reblog' => [
            'id' => '123',
            'created_at' => now()->subDays(3)->toIso8601String(),
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
        'created_at' => $olderBoostTime,
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

it('keeps boosted post when boost event is recent even if original post is old', function () {
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

it('filters boosted post when boost event is older than max_age_days', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $oldDate = now()->subDays(10)->toIso8601String();

    $boostedOldStatus = [
        'id' => '200',
        'created_at' => $oldDate, // boost event is old
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '100',
            'created_at' => $oldDate, // original post is also old
            'in_reply_to_id' => null,
            'url' => 'https://fosstodon.org/@author/100',
            'content' => '<p>old boosted post</p>',
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

    expect($result['posts'])->toHaveCount(0);
});

it('keeps boosted post when boosted_by_created_at is null and post is recent', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $recentDate = now()->subDays(2)->toIso8601String();

    // Outer status intentionally has no created_at → boosted_by_created_at will be null
    $boostedStatus = [
        'id' => '300',
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '150',
            'created_at' => $recentDate,
            'in_reply_to_id' => null,
            'url' => 'https://fosstodon.org/@author/150',
            'content' => '<p>recent post boosted without timestamp</p>',
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
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$boostedStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1);
});

it('filters boosted post when boosted_by_created_at is null and post is old', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $oldDate = now()->subDays(10)->toIso8601String();

    // Outer status intentionally has no created_at → boosted_by_created_at will be null
    $boostedStatus = [
        'id' => '400',
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'Booster', 'acct' => 'booster', 'avatar' => 'https://fosstodon.org/booster.png', 'emojis' => []],
        'reblog' => [
            'id' => '200',
            'created_at' => $oldDate,
            'in_reply_to_id' => null,
            'url' => 'https://fosstodon.org/@author/200',
            'content' => '<p>old post boosted without timestamp</p>',
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
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$boostedStatus]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(0);
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

it('suppresses cw_text for whitelisted categories without dropping the post', function () {
    $user = User::factory()->create(['feed_preferences' => [
        'cw_label_whitelist' => ['adult'],
        'max_age_days' => null,
    ]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $makeBlueskyPost = fn (string $rkey, array $labels) => [
        'post' => [
            'uri' => "at://did:plc:abc/app.bsky.feed.post/{$rkey}",
            'record' => ['text' => "post {$rkey}", 'createdAt' => now()->toIso8601String()],
            'author' => ['displayName' => 'Me', 'handle' => 'me.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => $labels,
            'embed' => null,
        ],
    ];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn([
        'posts' => [
            $makeBlueskyPost('whitelisted', [['val' => 'sexual']]),
            $makeBlueskyPost('not-whitelisted', [['val' => 'gore']]),
        ],
        'cursor' => null,
    ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    $whitelisted = collect($result['posts'])->firstWhere('id', 'bluesky_at://did:plc:abc/app.bsky.feed.post/whitelisted');
    $notWhitelisted = collect($result['posts'])->firstWhere('id', 'bluesky_at://did:plc:abc/app.bsky.feed.post/not-whitelisted');

    expect($result['posts'])->toHaveCount(2)
        ->and($whitelisted['cw_text'])->toBeNull()
        ->and($whitelisted['cw_category'])->toBeNull()
        // Whitelisting only suppresses the CW overlay — sensitive_media is a separate,
        // independently-controlled blur (sensitive_media_behavior) and must survive.
        ->and($whitelisted['sensitive_media'])->toBeTrue()
        ->and($notWhitelisted['cw_text'])->toBe('Graphic media')
        ->and($notWhitelisted['cw_category'])->toBe('graphic');
});

it('whitelisting generic does not suppress cw_text for the separate safety category', function () {
    $user = User::factory()->create(['feed_preferences' => [
        'cw_label_whitelist' => ['generic'],
        'max_age_days' => null,
    ]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn([
        'posts' => [[
            'post' => [
                'uri' => 'at://did:plc:abc/app.bsky.feed.post/threat',
                'record' => ['text' => 'post', 'createdAt' => now()->toIso8601String()],
                'author' => ['displayName' => 'Me', 'handle' => 'me.bsky.social', 'avatar' => ''],
                'labels' => [['val' => 'threat']],
                'embed' => null,
            ],
        ]],
        'cursor' => null,
    ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'][0]['cw_text'])->toBe('threatening content')
        ->and($result['posts'][0]['cw_category'])->toBe('safety');
});

it('does not suppress a CW when only one of a multi-category post\'s categories is whitelisted', function () {
    // Regression for a review finding on #239: a post with both 'porn' (adult) and
    // 'self-harm' (safety) labels used to collapse to a single display cw_category
    // ('adult'), so whitelisting only 'adult' silently cleared the CW entirely —
    // unblurring the post despite its non-whitelisted safety label.
    $user = User::factory()->create(['feed_preferences' => [
        'cw_label_whitelist' => ['adult'],
        'max_age_days' => null,
    ]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn([
        'posts' => [[
            'post' => [
                'uri' => 'at://did:plc:abc/app.bsky.feed.post/multi',
                'record' => ['text' => 'post', 'createdAt' => now()->toIso8601String()],
                'author' => ['displayName' => 'Me', 'handle' => 'me.bsky.social', 'avatar' => ''],
                'labels' => [['val' => 'porn'], ['val' => 'self-harm']],
                'embed' => null,
            ],
        ]],
        'cursor' => null,
    ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'][0]['cw_text'])->not->toBeNull()
        ->and($result['posts'][0]['cw_category'])->not->toBeNull();
});

it('suppresses a multi-category CW once every touched category is whitelisted', function () {
    $user = User::factory()->create(['feed_preferences' => [
        'cw_label_whitelist' => ['adult', 'safety'],
        'max_age_days' => null,
    ]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn([
        'posts' => [[
            'post' => [
                'uri' => 'at://did:plc:abc/app.bsky.feed.post/multi',
                'record' => ['text' => 'post', 'createdAt' => now()->toIso8601String()],
                'author' => ['displayName' => 'Me', 'handle' => 'me.bsky.social', 'avatar' => ''],
                'labels' => [['val' => 'porn'], ['val' => 'self-harm']],
                'embed' => null,
            ],
        ]],
        'cursor' => null,
    ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'][0]['cw_text'])->toBeNull()
        ->and($result['posts'][0]['cw_category'])->toBeNull()
        ->and($result['posts'][0]['cw_categories'])->toBe([]);
});

it('suppresses cw_text on a whitelisted quoted_post without touching the top-level post', function () {
    $user = User::factory()->create(['feed_preferences' => [
        'cw_label_whitelist' => ['adult'],
        'max_age_days' => null,
    ]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn([
        'posts' => [[
            'post' => [
                'uri' => 'at://did:plc:abc/app.bsky.feed.post/quoter',
                'record' => ['text' => 'check this out', 'createdAt' => now()->toIso8601String()],
                'author' => ['displayName' => 'Me', 'handle' => 'me.bsky.social', 'avatar' => ''],
                'labels' => [['val' => 'gore']],
                'embed' => [
                    '$type' => 'app.bsky.embed.record#view',
                    'record' => [
                        '$type' => 'app.bsky.embed.record#viewRecord',
                        'uri' => 'at://did:plc:bob/app.bsky.feed.post/0',
                        'author' => ['did' => 'did:plc:bob', 'handle' => 'bob.bsky.social', 'displayName' => 'Bob'],
                        'value' => ['text' => 'nsfw quoted post', 'createdAt' => now()->toIso8601String()],
                        'labels' => [['val' => 'porn', 'src' => 'did:plc:bob']],
                    ],
                ],
            ],
        ]],
        'cursor' => null,
    ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['cw_text'])->toBe('Graphic media')
        ->and($result['posts'][0]['cw_category'])->toBe('graphic')
        ->and($result['posts'][0]['quoted_post']['cw_text'])->toBeNull()
        ->and($result['posts'][0]['quoted_post']['cw_category'])->toBeNull();
});

it('applies age cutoff to bluesky posts', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 7]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@me.bsky.social',
    ]);

    $oldDate = now()->subDays(10)->toIso8601String();
    $newDate = now()->subDays(2)->toIso8601String();

    $makeBlueskyPost = fn (string $rkey, string $date) => [
        'post' => [
            'uri' => "at://did:plc:abc/app.bsky.feed.post/{$rkey}",
            'record' => ['text' => "post {$rkey}", 'createdAt' => $date],
            'author' => ['displayName' => 'Me', 'handle' => 'me.bsky.social', 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [],
            'embed' => null,
        ],
    ];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn([
        'posts' => [$makeBlueskyPost('old', $oldDate), $makeBlueskyPost('new', $newDate)],
        'cursor' => null,
    ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['id'])->toContain('new');
});

it('account-level null max_age_days disables cutoff even when user has one set', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 3]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
        'feed_settings' => ['max_age_days' => null], // account explicitly disables cutoff
    ]);

    // Post is 10 days old — outside user's 3-day cutoff, but account disables it
    $tenDaysAgo = now()->subDays(10)->toIso8601String();

    $status = [
        'id' => '1',
        'created_at' => $tenDaysAgo,
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@author/1',
        'content' => '<p>old post</p>',
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

it('does not classify or resolve mentions when mentionsEnabled is false', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
    ]);

    $status = [
        'id' => '1',
        'content' => '<p>check this out @alice</p>',
        'created_at' => '2024-01-15T10:00:00.000Z',
        'url' => 'https://fosstodon.org/@user/1',
        'in_reply_to_id' => null,
        'account' => ['display_name' => 'User', 'acct' => 'user', 'avatar' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'mentions' => [
            ['id' => '2', 'username' => 'alice', 'url' => 'https://fosstodon.org/@alice', 'acct' => 'alice'],
        ],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$status]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    // Deliberately NOT stubbing resolveMentionProfiles — if FeedAggregator
    // calls it despite mentionsEnabled being false, Mockery will throw.

    $aggregator = new FeedAggregator(
        $mastodon,
        Mockery::mock(BlueskyFeedService::class),
        app(PostNormalizer::class),
    );

    $result = $aggregator->fetch($user, mentionsEnabled: false);

    expect($result['posts'][0]['body'])->toBe('check this out @alice')
        ->and($result['posts'][0]['chip_mentions'])->toBe([]);
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

it('fetches public mastodon timeline without authentication', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->publicMastodon('https://social.example')->create(['user_id' => $user->id]);

    $status = [
        'id' => '1',
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'url' => 'https://social.example/@author/1',
        'content' => '<p>public post</p>',
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://social.example/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getPublicTimeline')
        ->once()
        ->with('https://social.example', Mockery::any())
        ->andReturn([$status]);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['source'])->toBe('mastodon')
        ->and($result['posts'][0]['source_instance'])->toBe('social.example')
        ->and($result['posts'][0]['feed_type'])->toBe('public_mastodon')
        ->and($result['posts'][0]['feed_name'])->toBe('social.example');
});

it('falls back to home account when public mastodon returns 401', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->publicMastodon('https://social.example')->create(['user_id' => $user->id]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://social.example',
        'access_token' => 'tok',
        'handle' => '@me@social.example',
    ]);

    $status = [
        'id' => '2',
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'url' => 'https://social.example/@author/2',
        'content' => '<p>home post</p>',
        'spoiler_text' => '',
        'sensitive' => false,
        'account' => ['display_name' => 'Author', 'acct' => 'author', 'avatar' => 'https://social.example/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getPublicTimeline')->andReturn(null);
    // called twice: once as fallback for the public account, once for the home account's own iteration
    $mastodon->shouldReceive('getHomeTimeline')->twice()->andReturn([$status]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->not->toBeEmpty();
});

it('fetches bluesky algorithmic feed using home account credentials', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    $homeAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);
    SocialAccount::factory()->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/whats-hot')->create([
        'user_id' => $user->id,
    ]);

    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:author/app.bsky.feed.post/abc',
            'cid' => 'cid1',
            'author' => ['did' => 'did:plc:author', 'handle' => 'author.bsky.social', 'displayName' => 'Author', 'avatar' => 'https://cdn.bsky.app/av.jpg', 'banner' => null],
            'record' => ['$type' => 'app.bsky.feed.post', 'text' => 'hello algo feed', 'createdAt' => now()->toIso8601String()],
            'indexedAt' => now()->toIso8601String(),
            'likeCount' => 0,
            'repostCount' => 0,
            'replyCount' => 0,
        ],
    ];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    // The home account's own iteration calls getHomeTimeline; it returns nothing interesting here
    $bluesky->shouldReceive('getHomeTimeline')
        ->once()
        ->andReturn(['posts' => [], 'cursor' => null]);
    $bluesky->shouldReceive('getFeed')
        ->once()
        ->with(Mockery::any(), 'at://did:plc:test/app.bsky.feed.generator/whats-hot', Mockery::any(), null)
        ->andReturn(['posts' => [$feedPost], 'cursor' => null]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['source'])->toBe('bluesky')
        ->and($result['posts'][0]['feed_type'])->toBe('bluesky_feed')
        ->and($result['posts'][0]['feed_name'])->toBe('Whats Hot');
});

it('tags home account posts with feed_type home and a null feed_name', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $status = [
        'id' => '1',
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@author/1',
        'content' => '<p>a home post</p>',
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

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['feed_type'])->toBe('home')
        ->and($result['posts'][0]['feed_name'])->toBeNull();
});

it('prefers the stored real feed name over the humanized slug guess', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);
    SocialAccount::factory()
        ->blueskyFeed('at://did:plc:test/app.bsky.feed.generator/whats-hot', "What's Hot")
        ->create(['user_id' => $user->id]);

    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:author/app.bsky.feed.post/abc',
            'cid' => 'cid1',
            'author' => ['did' => 'did:plc:author', 'handle' => 'author.bsky.social', 'displayName' => 'Author', 'avatar' => 'https://cdn.bsky.app/av.jpg', 'banner' => null],
            'record' => ['$type' => 'app.bsky.feed.post', 'text' => 'hello algo feed', 'createdAt' => now()->toIso8601String()],
            'indexedAt' => now()->toIso8601String(),
            'likeCount' => 0,
            'repostCount' => 0,
            'replyCount' => 0,
        ],
    ];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->once()->andReturn(['posts' => [], 'cursor' => null]);
    $bluesky->shouldReceive('getFeed')->once()->andReturn(['posts' => [$feedPost], 'cursor' => null]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['feed_type'])->toBe('bluesky_feed')
        ->and($result['posts'][0]['feed_name'])->toBe("What's Hot");
});

it('does not drop algorithmic feed posts when combined feeds exceed the old default buffer', function () {
    // Regression: buffer_size was 40 by default. With 25 home posts + 25 algo posts = 50,
    // the 10 oldest algo posts would be silently cut because algo feeds surface older content.
    config(['feed.buffer_size' => 200, 'feed.max_age_days' => null]);

    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);
    SocialAccount::factory()->blueskyFeed()->create(['user_id' => $user->id]);

    $makePost = fn (string $id, string $date) => [
        'post' => [
            'uri' => "at://did:plc:author/app.bsky.feed.post/{$id}",
            'cid' => "cid{$id}",
            'author' => ['did' => 'did:plc:author', 'handle' => 'author.bsky.social', 'displayName' => 'Author', 'avatar' => 'https://cdn.bsky.app/av.jpg', 'banner' => null],
            'record' => ['$type' => 'app.bsky.feed.post', 'text' => "post {$id}", 'createdAt' => $date],
            'indexedAt' => $date,
            'likeCount' => 0,
            'repostCount' => 0,
            'replyCount' => 0,
        ],
    ];

    $homePosts = array_map(fn ($i) => $makePost("home{$i}", now()->subMinutes($i)->toIso8601String()), range(1, 25));
    // Algo feed surfaces older content — all posts are a few hours old
    $algoPosts = array_map(fn ($i) => $makePost("algo{$i}", now()->subHours($i + 1)->toIso8601String()), range(1, 25));

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => $homePosts, 'cursor' => null]);
    $bluesky->shouldReceive('getFeed')->andReturn(['posts' => $algoPosts, 'cursor' => null]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    $ids = array_column($result['posts'], 'id');
    // Normalized Bluesky IDs are prefixed: "bluesky_{uri}"
    $algoIds = array_values(array_filter($ids, fn ($id) => str_contains($id, '/algo')));

    expect($result['posts'])->toHaveCount(50)
        ->and($algoIds)->toHaveCount(25);
});

it('returns posts from other accounts when one provider throws a connection exception', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'tok',
        'handle' => '@me@fosstodon.org',
    ]);
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'feed_type' => 'home',
        'instance_url' => 'https://bsky.social',
        'access_token' => 'tok',
        'handle' => '@alice.bsky.social',
    ]);

    $status = [
        'id' => '1',
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => null,
        'url' => 'https://fosstodon.org/@author/1',
        'content' => '<p>mastodon post</p>',
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

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')
        ->andThrow(new ConnectionException('timeout'));

    $aggregator = new FeedAggregator($mastodon, $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['source'])->toBe('mastodon');
});

it('sets auth_failed_at when public mastodon requires auth but no home account exists', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    $publicAccount = SocialAccount::factory()->publicMastodon('https://auth-required.example')->create([
        'user_id' => $user->id,
    ]);

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getPublicTimeline')->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toBeEmpty();
    $publicAccount->refresh();
    expect($publicAccount->auth_failed_at)->not->toBeNull();
});
