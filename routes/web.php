<?php

use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Auth\PasskeyAuthController;
use App\Http\Controllers\Auth\PasskeyRecoveryController;
use App\Http\Controllers\Auth\RegisteredUserController;
use App\Http\Controllers\FeedController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Vite;

Route::get('/', fn () => redirect()->route(auth()->check() ? 'feed' : 'login'))->name('home');

Route::get('site.webmanifest', function () {
    return response()->json([
        'name' => config('app.name', 'Sprouter'),
        'short_name' => config('app.name', 'Sprouter'),
        'icons' => [
            [
                'src' => Vite::asset('resources/icons/web-app-manifest-192x192.png'),
                'sizes' => '192x192',
                'type' => 'image/png',
            ],
            [
                'src' => Vite::asset('resources/icons/web-app-manifest-512x512.png'),
                'sizes' => '512x512',
                'type' => 'image/png',
            ],
            [
                'src' => Vite::asset('resources/icons/web-app-manifest-192x192.png'),
                'sizes' => '192x192',
                'type' => 'image/png',
                'purpose' => 'maskable',
            ],
            [
                'src' => Vite::asset('resources/icons/web-app-manifest-512x512.png'),
                'sizes' => '512x512',
                'type' => 'image/png',
                'purpose' => 'maskable',
            ],
        ],
        'theme_color' => '#ffffff',
        'background_color' => '#ffffff',
        'display' => 'standalone',
    ])->header('Content-Type', 'application/manifest+json');
})->name('manifest.webmanifest');

Route::middleware(['auth', 'passkey.exists'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
    Route::get('feed', [FeedController::class, 'index'])->name('feed');

    Route::get('auth/passkey/confirm/options', [PasskeyAuthController::class, 'confirmOptions'])
        ->name('passkey.confirm.options');
    Route::post('auth/passkey/confirm', [PasskeyAuthController::class, 'confirm'])
        ->name('passkey.confirm');
});

Route::middleware('guest')->group(function () {
    Route::get('login', [AuthenticatedSessionController::class, 'create'])->name('login');
    Route::get('register', [RegisteredUserController::class, 'create'])->name('register');
    Route::post('register', [RegisteredUserController::class, 'store'])->name('register.store');

    Route::get('recover', [PasskeyRecoveryController::class, 'create'])->name('passkey.recover');
    Route::post('recover', [PasskeyRecoveryController::class, 'store'])
        ->middleware('throttle:5,1')
        ->name('passkey.recover.store');
    Route::get('recover/sent', [PasskeyRecoveryController::class, 'sent'])->name('passkey.recover.sent');
    Route::get('recover/{token}', [PasskeyRecoveryController::class, 'setup'])->name('passkey.recover.setup');

    Route::get('auth/passkey/options', [PasskeyAuthController::class, 'options'])
        ->name('passkey.auth.options');
    Route::post('auth/passkey/authenticate', [PasskeyAuthController::class, 'authenticate'])
        ->middleware('throttle:10,1')
        ->name('passkey.auth.authenticate');
});

Route::post('logout', [AuthenticatedSessionController::class, 'destroy'])
    ->middleware('auth')
    ->name('logout');

require __DIR__.'/settings.php';
