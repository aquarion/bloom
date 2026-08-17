<?php

namespace App\Enums;

use App\Contracts\ProviderFeedSource;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Mastodon\MastodonFeedService;

enum ProviderType: string
{
    case Mastodon = 'mastodon';
    case Bluesky = 'bluesky';

    /**
     * Resolves the feed-fetching implementation bound to this provider.
     */
    public function strategy(): ProviderFeedSource
    {
        return match ($this) {
            self::Mastodon => app(MastodonFeedService::class),
            self::Bluesky => app(BlueskyFeedService::class),
        };
    }
}
