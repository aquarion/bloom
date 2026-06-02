<?php

use App\Models\SocialAccount;
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
