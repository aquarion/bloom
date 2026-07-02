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

        $cached = Cache::get(self::CACHE_KEY);
        if ($cached !== null) {
            return $cached;
        }

        try {
            $siteId = $this->ensureSite();
            $goals = $this->ensureGoals($siteId);

            $config = [
                'tracker_url' => config('services.matomo.url'),
                'site_id' => $siteId,
                'goals' => $goals,
            ];

            Cache::put(self::CACHE_KEY, $config, self::CACHE_TTL);

            return $config;
        } catch (\Throwable $e) {
            Log::warning('Matomo config lookup failed', [
                'message' => $e->getMessage(),
                'exception' => $e,
                'app_url' => config('app.url'),
                'matomo_url' => config('services.matomo.url'),
            ]);

            return null;
        }
    }

    private function ensureSite(): int
    {
        $appUrl = rtrim(config('app.url'), '/');
        $sites = $this->api('SitesManager.getAllSites');

        foreach ($sites as $site) {
            if (rtrim($site['main_url'], '/') === $appUrl) {
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
                    'pattern' => $name,
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

        $data = $response->json();

        if (($data['result'] ?? null) === 'error') {
            throw new \RuntimeException('Matomo API error for '.$method.': '.($data['message'] ?? 'unknown error'));
        }

        return $data;
    }
}
