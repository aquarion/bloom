<?php

namespace App\Services\Feed;

use Illuminate\Support\Facades\Http;

/**
 * Intercepts outbound Mastodon/Bluesky API calls with fixture responses, so a developer
 * can preview representative feed content (polls, boosts, replies, quotes, CWs, media)
 * without a real connected social account. Only ever wired up from AppServiceProvider
 * when config('feed.demo_mode') is enabled — never in production, and never silently
 * for a developer testing against a real connected account, since real requests aren't
 * touched (any URL that doesn't match one of these fakes is passed through untouched;
 * see Illuminate\Http\Client\PendingRequest::buildStubHandler()).
 */
class FeedDemoFixtures
{
    public const MASTODON_INSTANCE = 'https://demo.mastodon.local';

    public const MASTODON_HANDLE = 'bloomdemo';

    public const MASTODON_ACCESS_TOKEN = 'demo-mastodon-fixture-token'; // pragma: allowlist secret

    public const BLUESKY_PDS = 'https://bsky.social';

    public const BLUESKY_HANDLE = 'bloomdemo.bsky.social';

    public const BLUESKY_ACCESS_TOKEN = 'demo-bluesky-fixture-token'; // pragma: allowlist secret

    private string $fixturesPath;

    public function __construct(string $fixturesPath = '')
    {
        $this->fixturesPath = $fixturesPath !== '' ? $fixturesPath : storage_path('fixtures');
    }

    public function register(): void
    {
        $mastodon = $this->readFixture('mastodon-posts.json');
        $bluesky = $this->readFixture('bluesky-posts.json');

        $this->requireArrayKey($mastodon, 'timeline', 'mastodon-posts.json');
        $this->requireArrayKey($bluesky, 'timeline', 'bluesky-posts.json');

        Http::fake([
            // Most specific first — Http::fake() uses the first matching pattern.
            self::MASTODON_INSTANCE.'/api/v1/statuses/*/context' => Http::response(['ancestors' => [], 'descendants' => []]),
            self::MASTODON_INSTANCE.'/api/v1/statuses/*' => function ($request) use ($mastodon) {
                $id = basename(parse_url($request->url(), PHP_URL_PATH));

                return isset($mastodon['reply_parents'][$id])
                    ? Http::response($mastodon['reply_parents'][$id])
                    : Http::response(['error' => 'Record not found'], 404);
            },
            self::MASTODON_INSTANCE.'/api/v1/timelines/home*' => Http::response($mastodon['timeline']),
            self::MASTODON_INSTANCE.'/api/v1/accounts/lookup*' => Http::response(['error' => 'Record not found'], 404),
            // Bluesky's endpoint is the same real host for every account, demo or not — unlike the
            // Mastodon fakes above (scoped by the fake demo.mastodon.local host), this one must also
            // check the bearer token so a developer's real connected Bluesky account isn't faked too.
            // Returning null here means "not handled by this stub", so Http falls through to the
            // real network for any request that isn't the demo account's.
            self::BLUESKY_PDS.'/xrpc/app.bsky.feed.getTimeline*' => function ($request) use ($bluesky) {
                if (! in_array('Bearer '.self::BLUESKY_ACCESS_TOKEN, $request->header('Authorization'), true)) {
                    return null;
                }

                return Http::response(['feed' => $bluesky['timeline'], 'cursor' => null]);
            },
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function readFixture(string $filename): array
    {
        $path = "{$this->fixturesPath}/{$filename}";

        if (! is_file($path)) {
            throw new \RuntimeException("Demo feed fixture does not exist: {$path}");
        }

        $contents = file_get_contents($path);

        if ($contents === false) {
            throw new \RuntimeException("Could not read demo feed fixture: {$path}");
        }

        $decoded = json_decode($contents, true);

        if (! is_array($decoded)) {
            throw new \RuntimeException("Demo feed fixture is not valid JSON: {$path}");
        }

        return $decoded;
    }

    /**
     * @param  array<string, mixed>  $fixture
     */
    private function requireArrayKey(array $fixture, string $key, string $filename): void
    {
        if (! isset($fixture[$key]) || ! is_array($fixture[$key])) {
            throw new \RuntimeException("Demo feed fixture {$filename} is missing a '{$key}' array");
        }
    }
}
