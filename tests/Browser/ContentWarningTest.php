<?php

use App\Models\SocialAccount;
use App\Models\User;
use Pest\Browser\Api\AwaitableWebpage;
use Tests\Support\FakeMastodon;

/**
 * One Mastodon account whose newest post carries a content warning (spoiler_text,
 * which PostNormalizer files under the 'generic' category), followed by a plain post.
 * PostAnimator renders each word as its own element, so tests match a single
 * distinctive word of the post ("butler") rather than the whole sentence.
 */
function userWithContentWarnedPost(): User
{
    $user = User::factory()->withPasskey()->create();
    $account = SocialAccount::factory()->for($user)->create([
        'provider' => 'mastodon',
        'instance_url' => 'https://social.example',
        'handle' => '@reader@social.example',
    ]);

    FakeMastodon::fakeTimelines([
        [$account, [
            FakeMastodon::status('301', 'The butler did it, obviously', now()->subMinutes(1)->toIso8601String(), [
                'spoiler_text' => 'Finale spoilers',
                'sensitive' => true,
            ]),
            FakeMastodon::status('302', 'Nothing to warn about here', now()->subMinutes(30)->toIso8601String()),
        ]],
    ]);

    return $user;
}

/**
 * Waits for the user's stored CW category whitelist to match. "Always" saves with a
 * fire-and-forget fetch, so this polls through the page — each wait() hands control back
 * to the in-process server so it can handle that request — instead of sleeping.
 *
 * @param  array<int, string>  $expected
 */
function waitForCwLabelWhitelist(AwaitableWebpage $page, User $user, array $expected): void
{
    for ($attempt = 0; $attempt < 20; $attempt++) {
        if ($user->fresh()->getPreference('cw_label_whitelist', []) === $expected) {
            return;
        }

        $page->wait(0.25);
    }

    expect($user->fresh()->getPreference('cw_label_whitelist', []))->toBe($expected);
}

test('a content-warned post is hidden behind an overlay until shown', function () {
    $user = userWithContentWarnedPost();

    $this->actingAs($user);

    visit('/feed')
        ->assertSee('The author marked this post as finale spoilers')
        ->click('Show anyway')
        ->assertDontSee('The author marked this post as finale spoilers')
        ->assertSee('butler')
        ->assertSeeIn('@post-cw-tag', 'Finale spoilers')
        ->assertNoJavaScriptErrors();

    // A one-off reveal must not be remembered for future posts.
    expect($user->fresh()->getPreference('cw_label_whitelist', []))->toBe([]);
});

test('choosing Always remembers the warning type so it is not hidden again', function () {
    $user = userWithContentWarnedPost();

    $this->actingAs($user);

    $page = visit('/feed')
        ->assertSee('The author marked this post as finale spoilers')
        ->click('Always')
        ->assertDontSee('The author marked this post as finale spoilers')
        ->assertSee('butler');

    waitForCwLabelWhitelist($page, $user, ['generic']);

    // actingAs() pins the User instance the in-process server sees on every request,
    // so hand it the saved preferences the way a real next request would load them.
    $this->actingAs($user->fresh());

    visit('/feed')
        ->assertSee('butler')
        ->assertDontSee('The author marked this post as finale spoilers')
        ->assertNoJavaScriptErrors();
});
