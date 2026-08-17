<?php

namespace App\Contracts;

use App\Models\SocialAccount;

interface ProviderFeedSource
{
    /**
     * @return array<int, array<string, mixed>>
     */
    public function getHomeTimeline(SocialAccount $account, int $limit = 20, ?string $cursor = null): array;

    /**
     * @param  array<int, array<string, mixed>>  $normalisedPosts
     * @return array<int, array<string, mixed>>
     */
    public function resolveMentionProfiles(array $normalisedPosts, SocialAccount $account): array;
}
