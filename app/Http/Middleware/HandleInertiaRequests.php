<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return md5(parent::version($request).config('version.version'));
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'appVersion' => $this->resolveAppVersion(),
        ];
    }

    private function resolveAppVersion(): ?array
    {
        $env = app()->environment();
        $repo = 'https://github.com/aquarion/bloom';

        if ($env === 'production') {
            $version = config('version.version');

            return $version ? ['label' => $version, 'url' => null] : null;
        }

        if ($env === 'staging') {
            $branch = config('version.branch');
            $pr = config('version.pr_number');

            if ($branch && $pr) {
                return ['label' => $branch, 'url' => "{$repo}/pull/{$pr}"];
            }

            return $branch ? ['label' => $branch, 'url' => null] : null;
        }

        if ($env === 'local') {
            $branch = $this->readGitHead();

            if (! $branch) {
                return null;
            }

            $encoded = implode('/', array_map('rawurlencode', explode('/', $branch)));

            return ['label' => $branch, 'url' => "{$repo}/tree/{$encoded}"];
        }

        return null;
    }

    private function readGitHead(): ?string
    {
        $path = config('version.git_head_path');

        if (! $path || ! file_exists($path)) {
            return null;
        }

        $contents = file_get_contents($path);

        if ($contents === false) {
            return null;
        }

        $contents = trim($contents);

        if (str_starts_with($contents, 'ref: refs/heads/')) {
            return substr($contents, strlen('ref: refs/heads/'));
        }

        return strlen($contents) >= 7 ? substr($contents, 0, 7) : null;
    }
}
