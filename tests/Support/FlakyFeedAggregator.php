<?php

namespace Tests\Support;

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Feed\FeedAggregator;
use App\Services\Feed\PostNormalizer;
use App\Services\Mastodon\MastodonFeedService;
use RuntimeException;

/**
 * A real FeedAggregator that throws for chosen accounts a set number of times before
 * behaving normally, so /feed/accounts/{account} answers with a 500 — the Bloom-side
 * failure the feed's per-account retry is built to recover from. Provider-side errors
 * can't be used for this: FeedAggregator::fetchAccount() catches those itself.
 */
class FlakyFeedAggregator extends FeedAggregator
{
    /**
     * @param  array<int, int>  $failuresRemaining  Account id => how many more fetches should fail.
     */
    public function __construct(
        private array $failuresRemaining,
        MastodonFeedService $mastodon,
        BlueskyFeedService $bluesky,
        PostNormalizer $normalizer,
    ) {
        parent::__construct($mastodon, $bluesky, $normalizer);
    }

    /**
     * @param  array<int, int>  $failuresRemaining  Account id => how many fetches should fail.
     */
    public static function failing(array $failuresRemaining): self
    {
        return new self(
            $failuresRemaining,
            app(MastodonFeedService::class),
            app(BlueskyFeedService::class),
            app(PostNormalizer::class),
        );
    }

    public function fetchAccount(User $user, SocialAccount $account, ?string $cursor = null, bool $mentionsEnabled = false): array
    {
        if (($this->failuresRemaining[$account->id] ?? 0) > 0) {
            $this->failuresRemaining[$account->id]--;

            throw new RuntimeException("Simulated feed failure for account {$account->id}");
        }

        return parent::fetchAccount($user, $account, $cursor, $mentionsEnabled);
    }
}
