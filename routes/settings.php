<?php

use App\Http\Controllers\Settings\PasskeyController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\SecurityController;
use App\Http\Controllers\Social\BlueskyController;
use App\Http\Controllers\Social\ConnectionsController;
use App\Http\Controllers\Social\MastodonController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::middleware(['auth'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');

    Route::get('register/passkey', fn () => Inertia::render('auth/passkey-setup'))
        ->name('passkey.setup');
    Route::post('register/passkey/skip', fn () => redirect()->route('dashboard'))
        ->name('passkey.setup.skip');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/security', [SecurityController::class, 'edit'])->name('security.edit');

    Route::put('settings/password', [SecurityController::class, 'update'])
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::inertia('settings/appearance', 'settings/appearance')->name('appearance.edit');

    // Connections settings page
    Route::get('settings/connections', function (Request $request) {
        return Inertia::render('settings/connections', [
            'connections' => $request->user()->socialAccounts()
                ->select('id', 'provider', 'handle', 'instance_url', 'auth_failed_at')
                ->get(),
            'status' => $request->session()->get('status'),
        ]);
    })->name('connections.edit');

    // Mastodon OAuth
    Route::post('auth/mastodon', [MastodonController::class, 'redirect'])->name('mastodon.redirect');
    Route::get('auth/mastodon/callback', [MastodonController::class, 'callback'])->name('mastodon.callback');
    Route::get('auth/mastodon/instances', [MastodonController::class, 'instances'])->name('mastodon.instances');

    // Bluesky app password
    Route::post('auth/bluesky', [BlueskyController::class, 'store'])->name('bluesky.store');
    Route::patch('auth/connections/{account}/bluesky', [BlueskyController::class, 'update'])->name('bluesky.update');

    // Mastodon re-auth (OAuth for an existing account)
    Route::post('auth/connections/{account}/mastodon', [MastodonController::class, 'redirectReauth'])->name('mastodon.reauth');

    // Disconnect any social account
    Route::delete('auth/connections/{account}', [ConnectionsController::class, 'destroy'])->name('connections.destroy');

    // Passkey management
    Route::get('settings/passkeys/register/options', [PasskeyController::class, 'registerOptions'])
        ->name('passkey.register.options');
    Route::post('settings/passkeys/register', [PasskeyController::class, 'store'])
        ->name('passkey.register.store');
    Route::delete('settings/passkeys/{passkey}', [PasskeyController::class, 'destroy'])
        ->name('passkey.destroy');
});
