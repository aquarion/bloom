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

    // Total number of posts returned in the buffer (aggregated from all providers)
    // This should be >= per_provider_limit to ensure diverse content
    'buffer_size' => env('FEED_BUFFER_SIZE', 40),

    // Maximum characters shown in reply-to and quoted-post context panels
    'context_body_limit' => env('FEED_CONTEXT_BODY_LIMIT', 300),

    // Maximum characters shown in main post body
    'body_limit' => env('FEED_BODY_LIMIT', 1024),
];
