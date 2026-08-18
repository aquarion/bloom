<?php

namespace App\Contracts;

use App\Models\SocialAccount;

interface ProviderFeedSource
{
    /**
     * Return shape is implementation-specific, not a shared contract: MastodonFeedService
     * returns a plain list of raw Mastodon statuses (array<int, array<string, mixed>>);
     * BlueskyFeedService returns array{posts: array<int, array<string, mixed>>, cursor: ?string}.
     * Callers (FeedAggregator) already branch per-provider and consume each shape directly.
     */
    public function getHomeTimeline(SocialAccount $account, int $limit = 20, ?string $cursor = null): array;

    /**
     * @param  array<int, array<string, mixed>>  $normalisedPosts
     * @return array<int, array<string, mixed>>
     */
    public function resolveMentionProfiles(array $normalisedPosts, SocialAccount $account): array;
}
