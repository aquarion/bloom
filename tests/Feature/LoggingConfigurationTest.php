<?php

use Illuminate\Support\Facades\Log;

test('the deprecations log channel is explicitly configured, not left to runtime self-configuration', function () {
    // See config/logging.php: HandleExceptions otherwise configures this lazily, at the
    // moment a deprecation first fires, by mutating the config repository at runtime —
    // which can race under Octane's persistent worker and silently fall back to the
    // emergency logger instead. Defining it statically here avoids that entirely.
    expect(config('logging.channels.deprecations'))
        ->toBeArray()
        ->and(config('logging.channels.deprecations')['driver'] ?? null)->not->toBeNull();
});

test('resolving the deprecations channel does not fall back to the emergency logger', function () {
    $logger = Log::channel('deprecations');

    // LogManager::get() swallows any resolution failure and silently substitutes an
    // emergency logger — hardcoded Monolog name 'laravel' — instead of throwing. A
    // normally resolved channel is named after the app environment instead (see
    // LogManager::getFallbackChannelName()); asserting that distinguishes the real
    // channel from the silent substitute that masked this on staging.
    expect($logger->getLogger()->getName())
        ->toBe(app()->environment())
        ->not->toBe('laravel');
});
