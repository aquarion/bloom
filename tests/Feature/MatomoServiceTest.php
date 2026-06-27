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

it('returns null and logs a warning when the matomo api is unreachable', function () {
    Http::fake([
        'stat.istic.net/*' => Http::response(null, 500),
    ]);
    Log::shouldReceive('warning')->once();

    expect((new MatomoService)->getConfig())->toBeNull();
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
