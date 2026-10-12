<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Feed\FeedAggregator;
use Tests\Support\FakeMastodon;
use Tests\Support\FlakyFeedAggregator;

/**
 * Two Mastodon accounts on different instances, each with one distinctive post.
 *
 * @return array{0: User, 1: SocialAccount, 2: SocialAccount}
 */
function userWithTwoMastodonAccounts(): array
{
    $user = User::factory()->withPasskey()->create();
    $first = SocialAccount::factory()->for($user)->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://first.example',
        'handle' => '@reader@first.example',
    ]);
    $second = SocialAccount::factory()->for($user)->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://second.example',
        'handle' => '@reader@second.example',
    ]);

    FakeMastodon::fakeTimelines([
        [$first, [FakeMastodon::status('101', 'Hello from the first instance', now()->subMinutes(5)->toIso8601String())]],
        [$second, [FakeMastodon::status('201', 'Hello from the second instance', now()->subMinutes(10)->toIso8601String())]],
    ]);

    return [$user, $first, $second];
}

test('posts from every connected account load into the feed', function () {
    [$user] = userWithTwoMastodonAccounts();

    $this->actingAs($user);

    // Whichever account answers first becomes the current post, so check the queue
    // panel (current post + everything queued) rather than what's on screen.
    visit('/feed')
        ->click('[aria-label="Show upcoming posts"]')
        ->assertSee('Up next · 2 posts')
        ->assertSee('Hello from the first instance')
        ->assertSee('Hello from the second instance')
        ->assertDontSee('retrying')
        ->assertNoJavaScriptErrors();
});

test('an account whose fetch fails once is retried and its posts still arrive', function () {
    [$user, , $second] = userWithTwoMastodonAccounts();

    $this->app->instance(FeedAggregator::class, FlakyFeedAggregator::failing([$second->id => 1]));
    $this->actingAs($user);

    visit('/feed')
        ->click('[aria-label="Show upcoming posts"]')
        ->assertSee('Up next · 2 posts')
        ->assertSee('Hello from the first instance')
        ->assertSee('Hello from the second instance')
        ->assertDontSee('retrying');
});

test('an account that keeps failing shows the retrying notice while other accounts still play', function () {
    [$user, , $second] = userWithTwoMastodonAccounts();

    // More failures than useFeedQueue's MAX_ACCOUNT_RETRIES, so the account never recovers.
    $this->app->instance(FeedAggregator::class, FlakyFeedAggregator::failing([$second->id => 10]));
    $this->actingAs($user);

    visit('/feed')
        ->assertSee("Couldn't load 1 account — retrying…")
        ->click('[aria-label="Show upcoming posts"]')
        ->assertSee('Up next · 1 posts')
        ->assertSee('Hello from the first instance')
        ->assertDontSee('Hello from the second instance');
});
