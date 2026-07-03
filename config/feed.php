<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Feed Configuration
    |--------------------------------------------------------------------------
    |
    | Settings for feed aggregation and caching behavior.
    |
    */

    // Number of posts to fetch from each provider per request
    'per_provider_limit' => env('FEED_PER_PROVIDER_LIMIT', 20),

    // Maximum posts returned after aggregating and deduplicating all feeds.
    // Acts as a memory ceiling — set high enough that normal multi-account setups
    // are never cut. Only intended as a safety valve for unusual configurations.
    'buffer_size' => env('FEED_BUFFER_SIZE', 200),

    // Maximum characters shown in reply-to and quoted-post context panels
    'context_body_limit' => env('FEED_CONTEXT_BODY_LIMIT', 300),

    // Maximum characters shown in main post body
    'body_limit' => env('FEED_BODY_LIMIT', 512),

    // Maximum age of posts to show (days). Posts older than this are filtered unless boosted.
    // Set to null to disable. Overrideable per-user via feed_preferences.
    'max_age_days' => env('FEED_MAX_AGE_DAYS', 7),

    // Mastodon instance used to fetch posts for the public welcome page
    'welcome_instance' => env('FEED_WELCOME_INSTANCE', 'fosstodon.org'),
];
