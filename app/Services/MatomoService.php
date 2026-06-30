<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MatomoService
{
    private const CACHE_KEY = 'matomo:config';

    private const CACHE_TTL = 3600;

    private const GOALS = [
        'registration' => 'Registration complete',
    ];

    public function getConfig(): ?array
    {
        if (! config('services.matomo.url') || ! config('services.matomo.auth_token')) {
            return null;
        }

        return Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
            try {
                $siteId = $this->ensureSite();
                $goals = $this->ensureGoals($siteId);

                return [
                    'tracker_url' => config('services.matomo.url'),
                    'site_id' => $siteId,
                    'goals' => $goals,
                ];
            } catch (\Throwable $e) {
                Log::warning('Matomo config lookup failed', [
                    'error' => $e->getMessage(),
                ]);

                return null;
            }
        });
    }

    private function ensureSite(): int
    {
        $appUrl = config('app.url');
        $sites = $this->api('SitesManager.getAllSites');

        foreach ($sites as $site) {
            if ($site['main_url'] === $appUrl) {
                return (int) $site['idsite'];
            }
        }

        $result = $this->api('SitesManager.addSite', [
            'siteName' => config('app.name'),
            'urls' => [$appUrl],
        ]);

        return (int) $result['value'];
    }

    private function ensureGoals(int $siteId): array
    {
        $existing = $this->api('Goals.getGoals', ['idSite' => $siteId]);
        $byName = array_column($existing, 'idgoal', 'name');

        $goals = [];
        foreach (self::GOALS as $key => $name) {
            if (isset($byName[$name])) {
                $goals[$key] = (int) $byName[$name];
            } else {
                $result = $this->api('Goals.addGoal', [
                    'idSite' => $siteId,
                    'name' => $name,
                    'matchAttribute' => 'manually',
                    'pattern' => '',
                    'patternType' => 'contains',
                    'caseSensitive' => false,
                    'revenue' => 0,
                    'allowMultipleConversionsPerVisit' => false,
                ]);
                $goals[$key] = (int) $result['value'];
            }
        }

        return $goals;
    }

    private function api(string $method, array $params = []): array
    {
        $response = Http::asForm()->post(config('services.matomo.url').'/index.php', array_merge([
            'module' => 'API',
            'method' => $method,
            'format' => 'json',
            'token_auth' => config('services.matomo.auth_token'),
        ], $params));

        $response->throw();

        return $response->json();
    }
}
