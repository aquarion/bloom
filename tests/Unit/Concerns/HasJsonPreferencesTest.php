<?php

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('returns default preferences when none are stored', function () {
    $user = User::factory()->create();

    expect($user->getPreference('max_age_days'))->toBe(7)
        ->and($user->getPreference('mute_words'))->toBe([])
        ->and($user->getPreference('cw_behavior'))->toBe('blur')
        ->and($user->getPreference('sensitive_media_behavior'))->toBe('blur');
});

it('returns stored preference over default', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 14]]);

    expect($user->getPreference('max_age_days'))->toBe(14);
});

it('returns custom default when key is missing', function () {
    $user = User::factory()->create();

    expect($user->getPreference('nonexistent_key', 'fallback'))->toBe('fallback');
});

it('returns full merged preferences', function () {
    $user = User::factory()->create(['feed_preferences' => ['max_age_days' => 3]]);

    $prefs = $user->getPreferences();

    expect($prefs['max_age_days'])->toBe(3)
        ->and($prefs['mute_words'])->toBe([])
        ->and($prefs['cw_behavior'])->toBe('blur');
});

it('saves a preference and persists it', function () {
    $user = User::factory()->create();
    $user->setPreference('max_age_days', 30);
    $user->refresh();

    expect($user->getPreference('max_age_days'))->toBe(30);
});

it('setPreference does not overwrite other preferences', function () {
    $user = User::factory()->create(['feed_preferences' => ['mute_words' => ['spam']]]);
    $user->setPreference('max_age_days', 5);
    $user->refresh();

    expect($user->getPreference('mute_words'))->toBe(['spam'])
        ->and($user->getPreference('max_age_days'))->toBe(5);
});
