<?php

use App\Services\MatomoService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

beforeEach(function () {
    Cache::flush();
    config([
        'services.matomo.url' => 'https://stat.istic.net',
        'services.matomo.auth_token' => 'test-token',
        'app.url' => 'https://bloom.example.com',
        'app.name' => 'Bloom',
    ]);
});

it('returns null when matomo url is not configured', function () {
    config(['services.matomo.url' => null]);

    expect((new MatomoService)->getConfig())->toBeNull();
});

it('returns null when matomo auth token is not configured', function () {
    config(['services.matomo.auth_token' => null]);

    expect((new MatomoService)->getConfig())->toBeNull();
});

it('returns null and logs a warning with diagnostic context when the matomo api is unreachable', function () {
    Http::fake([
        'stat.istic.net/*' => Http::response(null, 500),
    ]);
    Log::shouldReceive('warning')
        ->once()
        ->with('Matomo config lookup failed', Mockery::on(function (array $context) {
            return $context['app_url'] === 'https://bloom.example.com'
                && $context['matomo_url'] === 'https://stat.istic.net'
                && $context['exception'] instanceof Throwable
                && is_string($context['message']);
        }));

    expect((new MatomoService)->getConfig())->toBeNull();
});

it('matches an existing matomo site ignoring a trailing slash difference', function () {
    Http::fake([
        'stat.istic.net/*' => function ($request) {
            $method = $request->data()['method'] ?? '';

            if ($method === 'SitesManager.getAllSites') {
                return Http::response([[
                    'idsite' => '3',
                    'main_url' => 'https://bloom.example.com/',
                    'name' => 'Bloom',
                ]]);
            }

            if ($method === 'Goals.getGoals') {
                return Http::response([
                    ['idgoal' => '1', 'name' => 'Registration complete'],
                ]);
            }

            return Http::response([], 200);
        },
    ]);

    $config = (new MatomoService)->getConfig();

    expect($config['site_id'])->toBe(3);
    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'SitesManager.addSite'));
});

it('uses an existing matomo site when app url matches', function () {
    Http::fake([
        'stat.istic.net/*' => function ($request) {
            $method = $request->data()['method'] ?? '';

            if ($method === 'SitesManager.getAllSites') {
                return Http::response([[
                    'idsite' => '3',
                    'main_url' => 'https://bloom.example.com',
                    'name' => 'Bloom',
                ]]);
            }

            if ($method === 'Goals.getGoals') {
                return Http::response([
                    ['idgoal' => '1', 'name' => 'Registration complete'],
                ]);
            }

            return Http::response([], 200);
        },
    ]);

    $config = (new MatomoService)->getConfig();

    expect($config['site_id'])->toBe(3);
    Http::assertSentCount(2);
});

it('creates a new matomo site when none matches app url', function () {
    Http::fake([
        'stat.istic.net/*' => function ($request) {
            $method = $request->data()['method'] ?? '';

            if ($method === 'SitesManager.getAllSites') {
                return Http::response([]);
            }

            if ($method === 'SitesManager.addSite') {
                return Http::response(['value' => '7']);
            }

            if ($method === 'Goals.getGoals') {
                return Http::response([]);
            }

            if ($method === 'Goals.addGoal') {
                return Http::response(['value' => '1']);
            }

            return Http::response([], 200);
        },
    ]);

    $config = (new MatomoService)->getConfig();

    expect($config['site_id'])->toBe(7);
});

it('creates missing goals', function () {
    Http::fake([
        'stat.istic.net/*' => function ($request) {
            $method = $request->data()['method'] ?? '';

            if ($method === 'SitesManager.getAllSites') {
                return Http::response([['idsite' => '3', 'main_url' => 'https://bloom.example.com']]);
            }

            if ($method === 'Goals.getGoals') {
                return Http::response([]);
            }

            if ($method === 'Goals.addGoal') {
                return Http::response(['value' => '5']);
            }

            return Http::response([], 200);
        },
    ]);

    $config = (new MatomoService)->getConfig();

    expect($config['goals']['registration'])->toBe(5);
});

it('uses existing goals instead of creating new ones', function () {
    Http::fake([
        'stat.istic.net/*' => function ($request) {
            $method = $request->data()['method'] ?? '';

            if ($method === 'SitesManager.getAllSites') {
                return Http::response([['idsite' => '3', 'main_url' => 'https://bloom.example.com']]);
            }

            if ($method === 'Goals.getGoals') {
                return Http::response([
                    ['idgoal' => '2', 'name' => 'Registration complete'],
                ]);
            }

            return Http::response([], 200);
        },
    ]);

    $config = (new MatomoService)->getConfig();

    expect($config['goals']['registration'])->toBe(2);
    Http::assertNotSent(fn ($request) => str_contains($request->url(), 'Goals.addGoal'));
});

it('caches the config and does not call the api on subsequent requests', function () {
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

    $service = new MatomoService;
    $service->getConfig();
    $service->getConfig();

    Http::assertSentCount(2); // only the first call hits the API
});

it('returns the tracker url in the config', function () {
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

    $config = (new MatomoService)->getConfig();

    expect($config['tracker_url'])->toBe('https://stat.istic.net');
});
