<?php

namespace App\Providers;

use App\Enums\Role;
use App\Models\Passkey;
use App\Models\User;
use App\Services\Feed\FeedDemoFixtures;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
use Laravel\Passkeys\Passkeys;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // laravel/passkeys is a transitive dep of fortify that auto-discovers and registers
        // its own routes + route model binding; suppress both so our own take precedence.
        if (class_exists(Passkeys::class)) {
            Passkeys::ignoreRoutes();
        }
        Route::model('passkey', Passkey::class);

        if (! $this->app->environment('local')) {
            \URL::forceScheme('https');
        }

        // Opt-in, local-only fixture feed for previewing the feed UI without a real
        // connected account — see App\Services\Feed\FeedDemoFixtures.
        if ($this->app->environment('local') && config('feed.demo_mode')) {
            $this->app->make(FeedDemoFixtures::class)->register();
        }

        $this->configureDefaults();
        $this->configureGates();
    }

    /**
     * Configure authorization gates.
     */
    protected function configureGates(): void
    {
        Gate::define('admin', fn (User $user) => $user->hasRole(Role::Admin));
        Gate::define('subscriber', fn (User $user) => $user->hasRole(Role::Subscriber));
    }

    /**
     * Configure default behaviors for production-ready applications.
     */
    protected function configureDefaults(): void
    {
        Date::use(CarbonImmutable::class);

        DB::prohibitDestructiveCommands(
            app()->isProduction(),
        );

        Password::defaults(fn (): ?Password => app()->isProduction()
            ? Password::min(12)
                ->mixedCase()
                ->letters()
                ->numbers()
                ->symbols()
                ->uncompromised()
            : null,
        );
    }
}
