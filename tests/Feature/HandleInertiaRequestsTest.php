<?php

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    Cache::flush();
});

it('shares a null matomo config when matomo is not configured', function () {
    config([
        'services.matomo.url' => null,
        'services.matomo.auth_token' => null,
    ]);

    $this->withoutVite()->get('/login')->assertInertia(
        fn ($page) => $page->where('matomo', null),
    );
});

it('shares the matomo config with all inertia pages when configured', function () {
    config([
        'services.matomo.url' => 'https://stat.istic.net',
        'services.matomo.auth_token' => 'test-token',
        'app.url' => 'https://bloom.example.com',
        'app.name' => 'Bloom',
    ]);

    Http::fake([
        'stat.istic.net/*' => function ($request) {
            $method = $request->data()['method'] ?? '';

            if ($method === 'SitesManager.getAllSites') {
                return Http::response([['idsite' => '3', 'main_url' => 'https://bloom.example.com']]);
            }

            if ($method === 'Goals.getGoals') {
                return Http::response([['idgoal' => '1', 'name' => 'Registration complete']]);
            }

            return Http::response([], 200);
        },
    ]);

    $this->withoutVite()->get('/login')->assertInertia(
        fn ($page) => $page->where('matomo.tracker_url', 'https://stat.istic.net')
            ->where('matomo.site_id', 3)
            ->where('matomo.goals.registration', 1),
    );
});
