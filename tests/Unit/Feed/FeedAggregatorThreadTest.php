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

function makeMastodonStatus(string $id, string $acct, string $content, ?string $replyToId = null, int $repliesCount = 0): array
{
    return [
        'id' => $id,
        'created_at' => now()->toIso8601String(),
        'in_reply_to_id' => $replyToId,
        'url' => "https://fosstodon.org/@{$acct}/{$id}",
        'content' => "<p>{$content}</p>",
        'spoiler_text' => '',
        'sensitive' => false,
        'replies_count' => $repliesCount,
        'account' => ['display_name' => ucfirst($acct), 'acct' => $acct, 'avatar' => 'https://fosstodon.org/av.png', 'header' => '', 'emojis' => []],
        'media_attachments' => [],
        'emojis' => [],
        'card' => null,
        'quote' => null,
        'quote_id' => null,
        'tags' => [],
    ];
}

function makeBlueskyFeedPost(string $rkey, string $did, string $handle, string $text, int $replyCount = 0): array
{
    return [
        'post' => [
            'uri' => "at://{$did}/app.bsky.feed.post/{$rkey}",
            'record' => ['text' => $text, 'createdAt' => now()->toIso8601String()],
            'author' => ['did' => $did, 'handle' => $handle, 'displayName' => ucfirst($handle), 'avatar' => 'https://cdn.bsky.app/av.jpg'],
            'labels' => [],
            'embed' => null,
            'replyCount' => $replyCount,
        ],
    ];
}

it('attaches a mastodon self-reply chain as a thread and removes the continuation from the feed', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $head = makeMastodonStatus('1', 'author', 'part one', null, 1);
    $reply = makeMastodonStatus('2', 'author', 'part two', '1');

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->once()
        ->withArgs(fn ($acct, $id) => $id === '1')
        ->andReturn(['ancestors' => [], 'descendants' => [$reply]]);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['id'])->toBe('mastodon_1')
        ->and($result['posts'][0]['thread'])->toHaveCount(2)
        ->and($result['posts'][0]['thread'][0]['id'])->toBe('mastodon_1')
        ->and($result['posts'][0]['thread'][1]['id'])->toBe('mastodon_2')
        ->and($result['posts'][0]['thread'][0]['reply_to'])->toBeNull()
        ->and($result['posts'][0]['thread'][1]['reply_to'])->toBeNull();
});

it('walks a multi-step mastodon self-reply chain up to three entries', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $head = makeMastodonStatus('1', 'author', 'part one', null, 1);
    $second = makeMastodonStatus('2', 'author', 'part two', '1');
    $third = makeMastodonStatus('3', 'author', 'part three', '2');

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->once()
        ->withArgs(fn ($acct, $id) => $id === '1')
        ->andReturn(['ancestors' => [], 'descendants' => [$second, $third]]);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['thread'])->toHaveCount(3)
        ->and(array_column($result['posts'][0]['thread'], 'id'))->toBe(['mastodon_1', 'mastodon_2', 'mastodon_3']);
});

it('stops a mastodon thread walk at a branching self-reply', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $head = makeMastodonStatus('1', 'author', 'part one', null, 2);
    $branchA = makeMastodonStatus('2', 'author', 'branch a', '1');
    $branchB = makeMastodonStatus('3', 'author', 'branch b', '1');

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->once()
        ->withArgs(fn ($acct, $id) => $id === '1')
        ->andReturn(['ancestors' => [], 'descendants' => [$branchA, $branchB]]);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('stops a mastodon thread walk when a stranger replies before the author continues', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $head = makeMastodonStatus('1', 'author', 'part one', null, 2);
    $selfReply = makeMastodonStatus('2', 'author', 'part two', '1');
    $strangerReply = makeMastodonStatus('3', 'stranger', 'butting in', '1');

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->once()
        ->withArgs(fn ($acct, $id) => $id === '1')
        ->andReturn(['ancestors' => [], 'descendants' => [$selfReply, $strangerReply]]);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('does not call getContext for a mastodon post with no replies', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $head = makeMastodonStatus('1', 'author', 'a lone post', null, 0);

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldNotReceive('getContext');

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('caps mastodon getContext lookups at 5 per account batch to bound request time', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $statuses = array_map(
        fn (int $i) => makeMastodonStatus((string) $i, 'author', "part {$i}", null, 1),
        range(1, 7),
    );

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn($statuses);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->times(5)
        ->andReturn(null);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(7);
});

it('attaches a bluesky self-reply chain as a thread and removes the continuation from the feed', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@author.bsky.social',
    ]);

    $did = 'did:plc:author';
    $headFeedPost = makeBlueskyFeedPost('1', $did, 'author.bsky.social', 'part one', 1);
    $replyPost = makeBlueskyFeedPost('2', $did, 'author.bsky.social', 'part two')['post'];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => [$headFeedPost], 'cursor' => null]);
    $bluesky->shouldReceive('getPostThread')
        ->once()
        ->withArgs(fn ($acct, $uri) => $uri === $headFeedPost['post']['uri'])
        ->andReturn([
            '$type' => 'app.bsky.feed.defs#threadViewPost',
            'post' => $headFeedPost['post'],
            'replies' => [
                [
                    '$type' => 'app.bsky.feed.defs#threadViewPost',
                    'post' => $replyPost,
                    'replies' => [],
                ],
            ],
        ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['thread'])->toHaveCount(2)
        ->and($result['posts'][0]['thread'][0]['original_url'])->toContain('/1')
        ->and($result['posts'][0]['thread'][1]['original_url'])->toContain('/2');
});

it('stops a bluesky thread walk at a branching self-reply', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@author.bsky.social',
    ]);

    $did = 'did:plc:author';
    $headFeedPost = makeBlueskyFeedPost('1', $did, 'author.bsky.social', 'part one', 2);
    $branchA = makeBlueskyFeedPost('2', $did, 'author.bsky.social', 'branch a')['post'];
    $branchB = makeBlueskyFeedPost('3', $did, 'author.bsky.social', 'branch b')['post'];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => [$headFeedPost], 'cursor' => null]);
    $bluesky->shouldReceive('getPostThread')
        ->once()
        ->andReturn([
            '$type' => 'app.bsky.feed.defs#threadViewPost',
            'post' => $headFeedPost['post'],
            'replies' => [
                ['$type' => 'app.bsky.feed.defs#threadViewPost', 'post' => $branchA, 'replies' => []],
                ['$type' => 'app.bsky.feed.defs#threadViewPost', 'post' => $branchB, 'replies' => []],
            ],
        ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('stops a bluesky thread walk when a stranger replies alongside the author\'s continuation', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@author.bsky.social',
    ]);

    $did = 'did:plc:author';
    $headFeedPost = makeBlueskyFeedPost('1', $did, 'author.bsky.social', 'part one', 2);
    $selfReply = makeBlueskyFeedPost('2', $did, 'author.bsky.social', 'part two')['post'];
    $strangerReply = makeBlueskyFeedPost('3', 'did:plc:stranger', 'stranger.bsky.social', 'butting in')['post'];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => [$headFeedPost], 'cursor' => null]);
    $bluesky->shouldReceive('getPostThread')
        ->once()
        ->andReturn([
            '$type' => 'app.bsky.feed.defs#threadViewPost',
            'post' => $headFeedPost['post'],
            'replies' => [
                ['$type' => 'app.bsky.feed.defs#threadViewPost', 'post' => $selfReply, 'replies' => []],
                ['$type' => 'app.bsky.feed.defs#threadViewPost', 'post' => $strangerReply, 'replies' => []],
            ],
        ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('does not call getPostThread for a bluesky post with no replies', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@author.bsky.social',
    ]);

    $headFeedPost = makeBlueskyFeedPost('1', 'did:plc:author', 'author.bsky.social', 'a lone post', 0);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => [$headFeedPost], 'cursor' => null]);
    $bluesky->shouldNotReceive('getPostThread');

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('caps bluesky getPostThread lookups at 5 per account batch to bound request time', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@author.bsky.social',
    ]);

    $feedPosts = array_map(
        fn (int $i) => makeBlueskyFeedPost((string) $i, 'did:plc:author', 'author.bsky.social', "part {$i}", 1),
        range(1, 7),
    );

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => $feedPosts, 'cursor' => null]);
    $bluesky->shouldReceive('getPostThread')
        ->times(5)
        ->andReturn(null);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(7);
});

it('falls back to ungrouped posts when mastodon thread detection throws unexpectedly', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $head = makeMastodonStatus('1', 'author', 'part one', null, 1);

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')->andThrow(new RuntimeException('malformed response'));

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('falls back to ungrouped posts when bluesky thread detection throws unexpectedly', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'bluesky',
        'access_token' => 'token',
        'handle' => '@author.bsky.social',
    ]);

    $headFeedPost = makeBlueskyFeedPost('1', 'did:plc:author', 'author.bsky.social', 'part one', 1);

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->andReturn(['posts' => [$headFeedPost], 'cursor' => null]);
    $bluesky->shouldReceive('getPostThread')->andThrow(new RuntimeException('malformed response'));

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('caps a mastodon self-reply chain at MAX_THREAD_DEPTH entries', function () {
    $user = User::factory()->create();
    SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    // 1 head + 14 self-replies deep — well past the 10-entry chain-walk cap.
    $head = makeMastodonStatus('1', 'author', 'part 1', null, 1);
    $descendants = [];
    for ($i = 2; $i <= 15; $i++) {
        $descendants[] = makeMastodonStatus((string) $i, 'author', "part {$i}", (string) ($i - 1));
    }

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->once()
        ->andReturn(['ancestors' => [], 'descendants' => $descendants]);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    // 1 head + 10 chain entries (MAX_THREAD_DEPTH), not all 15.
    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['thread'])->toHaveCount(11)
        ->and($result['posts'][0]['thread'][10]['id'])->toBe('mastodon_11');
});

it('resolves mention profiles for mastodon thread entries', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'instance_url' => 'https://fosstodon.org',
        'access_token' => 'token',
        'handle' => '@me@fosstodon.org',
    ]);

    $head = makeMastodonStatus('1', 'author', 'part one', null, 1);
    $reply = makeMastodonStatus('2', 'author', 'part two, cc @alice', '1');

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getHomeTimeline')->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->once()
        ->andReturn(['ancestors' => [], 'descendants' => [$reply]]);
    $mastodon->shouldReceive('resolveMentionProfiles')
        ->once()
        ->withArgs(fn ($posts, $acct) => count($posts) === 1)
        ->andReturnUsing(fn ($posts) => $posts);
    $mastodon->shouldReceive('resolveMentionProfiles')
        ->once()
        ->withArgs(fn ($posts, $acct) => count($posts) === 2)
        ->andReturnUsing(fn ($posts) => $posts);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user, mentionsEnabled: true);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['thread'])->toHaveCount(2);
});

it('does not attach threads for an unauthenticated public mastodon timeline', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->publicMastodon('https://social.example')->create(['user_id' => $user->id]);

    $status = makeMastodonStatus('1', 'author', 'a public post', null, 1);
    $status['url'] = 'https://social.example/@author/1';

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getPublicTimeline')->andReturn([$status]);
    $mastodon->shouldNotReceive('getContext');

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0])->not->toHaveKey('thread');
});

it('attaches threads via the fallback home account when a public mastodon instance requires auth', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => null]]);
    SocialAccount::factory()->publicMastodon('https://social.example')->create(['user_id' => $user->id]);
    $homeAccount = SocialAccount::factory()->create([
        'user_id' => $user->id,
        'provider' => 'mastodon',
        'feed_type' => 'home',
        'instance_url' => 'https://social.example',
        'access_token' => 'tok',
        'handle' => '@me@social.example',
    ]);

    $head = makeMastodonStatus('1', 'author', 'part one', null, 1);
    $head['url'] = 'https://social.example/@author/1';
    $reply = makeMastodonStatus('2', 'author', 'part two', '1');
    $reply['url'] = 'https://social.example/@author/2';

    $mastodon = Mockery::mock(MastodonFeedService::class);
    $mastodon->shouldReceive('getPublicTimeline')->andReturn(null);
    // Once as the fallback fetch for the public account, once for the home account's own iteration.
    $mastodon->shouldReceive('getHomeTimeline')->twice()->andReturn([$head]);
    $mastodon->shouldReceive('getStatus')->andReturn(null);
    $mastodon->shouldReceive('getContext')
        ->twice()
        ->withArgs(fn (SocialAccount $acct, string $id) => $acct->is($homeAccount) && $id === '1')
        ->andReturn(['ancestors' => [], 'descendants' => [$reply]]);

    $aggregator = new FeedAggregator($mastodon, Mockery::mock(BlueskyFeedService::class), app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    // Both account iterations fetch the same underlying home timeline (public account's
    // auth fallback + the home account's own batch), so the top-level original_url dedup
    // collapses them to one post — but getContext must still be called with the *home*
    // account both times (asserted above), proving the fallback account is threaded
    // through correctly rather than silently skipped or passed the wrong credentials.
    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['thread'])->toHaveCount(2);
});

it('attaches bluesky threads using the home account, not the feed-specific account', function () {
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

    $did = 'did:plc:author';
    $headFeedPost = makeBlueskyFeedPost('1', $did, 'author.bsky.social', 'part one', 1);
    $replyPost = makeBlueskyFeedPost('2', $did, 'author.bsky.social', 'part two')['post'];

    $bluesky = Mockery::mock(BlueskyFeedService::class);
    $bluesky->shouldReceive('getHomeTimeline')->once()->andReturn(['posts' => [], 'cursor' => null]);
    $bluesky->shouldReceive('getFeed')->once()->andReturn(['posts' => [$headFeedPost], 'cursor' => null]);
    $bluesky->shouldReceive('getPostThread')
        ->once()
        ->withArgs(fn (SocialAccount $acct, string $uri) => $acct->is($homeAccount) && $uri === $headFeedPost['post']['uri'])
        ->andReturn([
            '$type' => 'app.bsky.feed.defs#threadViewPost',
            'post' => $headFeedPost['post'],
            'replies' => [
                ['$type' => 'app.bsky.feed.defs#threadViewPost', 'post' => $replyPost, 'replies' => []],
            ],
        ]);

    $aggregator = new FeedAggregator(Mockery::mock(MastodonFeedService::class), $bluesky, app(PostNormalizer::class));
    $result = $aggregator->fetch($user);

    expect($result['posts'])->toHaveCount(1)
        ->and($result['posts'][0]['thread'])->toHaveCount(2);
});
