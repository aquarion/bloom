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

    public function register(): void
    {
        $mastodon = $this->readFixture('mastodon-posts.json');
        $bluesky = $this->readFixture('bluesky-posts.json');

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
            self::BLUESKY_PDS.'/xrpc/app.bsky.feed.getTimeline*' => Http::response([
                'feed' => $bluesky['timeline'],
                'cursor' => null,
            ]),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function readFixture(string $filename): array
    {
        return json_decode(file_get_contents(storage_path("fixtures/{$filename}")), true);
    }
}
