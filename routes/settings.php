<?php

use App\Http\Controllers\Settings\BetaTesterController;
use App\Http\Controllers\Settings\FeedSettingsController;
use App\Http\Controllers\Settings\PasskeyController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\SecurityController;
use App\Http\Controllers\Social\BlueskyController;
use App\Http\Controllers\Social\BlueskyFeedDiscoveryController;
use App\Http\Controllers\Social\ConnectionsController;
use App\Http\Controllers\Social\MastodonController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth', 'passkey.exists'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])
        ->middleware('passkey.confirmed')
        ->name('profile.destroy');

    // Passkey setup — excluded from EnsurePasskeyExists so new/recovered users can enrol
    Route::get('register/passkey', fn (Request $request) => Inertia::render('auth/passkey-setup', [
        'status' => $request->session()->get('status'),
    ]))->name('passkey.setup');

    Route::get('settings/security', [SecurityController::class, 'edit'])->name('security.edit');

    Route::inertia('settings/appearance', 'settings/appearance')->name('appearance.edit');

    // Connections settings page
    Route::get('settings/connections', [ConnectionsController::class, 'edit'])->name('connections.edit');

    // Mastodon OAuth
    Route::post('auth/mastodon', [MastodonController::class, 'redirect'])->name('mastodon.redirect');
    Route::get('auth/mastodon/callback', [MastodonController::class, 'callback'])->name('mastodon.callback');
    Route::get('auth/mastodon/instances', [MastodonController::class, 'instances'])->name('mastodon.instances');

    // Bluesky app password
    Route::post('auth/bluesky', [BlueskyController::class, 'store'])->name('bluesky.store');
    Route::patch('auth/connections/{account}/bluesky', [BlueskyController::class, 'update'])->name('bluesky.update');

    // Mastodon re-auth (OAuth for an existing account)
    Route::post('auth/connections/{account}/mastodon', [MastodonController::class, 'redirectReauth'])->name('mastodon.reauth');

    // Add public Mastodon timeline
    Route::post('auth/connections/public-mastodon', [ConnectionsController::class, 'storePublicMastodon'])->name('connections.public-mastodon.store');

    // Add Bluesky algorithmic feed
    Route::post('auth/connections/bluesky-feed', [ConnectionsController::class, 'storeBlueskyFeed'])->name('connections.bluesky-feed.store');

    // Browse/search Bluesky algorithmic feeds
    Route::get('settings/connections/bluesky-feeds', [BlueskyFeedDiscoveryController::class, 'index'])->name('connections.bluesky-feeds.browse');
    Route::get('settings/connections/bluesky-feeds/search', [BlueskyFeedDiscoveryController::class, 'search'])->name('connections.bluesky-feeds.search');

    // Disconnect any social account
    Route::delete('auth/connections/{account}', [ConnectionsController::class, 'destroy'])->name('connections.destroy');

    // Beta tester toggle
    Route::patch('settings/profile/beta-tester', [BetaTesterController::class, 'update'])
        ->name('beta-tester.update');

    // Feed settings
    Route::get('settings/feed', [FeedSettingsController::class, 'edit'])->name('feed.settings.edit');
    Route::put('settings/feed', [FeedSettingsController::class, 'update'])->name('feed.settings.update');
    Route::put('settings/connections/{account}/feed', [FeedSettingsController::class, 'updateAccount'])->name('connections.feed.update');
    Route::post('settings/feed/whitelisted-authors', [FeedSettingsController::class, 'whitelistAuthor'])->name('feed.settings.whitelist-author');

    // Passkey management — register routes excluded from EnsurePasskeyExists
    Route::get('settings/passkeys/register/options', [PasskeyController::class, 'registerOptions'])
        ->name('passkey.register.options');
    Route::post('settings/passkeys/register', [PasskeyController::class, 'store'])
        ->name('passkey.register.store');
    Route::delete('settings/passkeys/{passkey}', [PasskeyController::class, 'destroy'])
        ->name('passkey.destroy');
});
