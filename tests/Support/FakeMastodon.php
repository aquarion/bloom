<?php

namespace Tests\Support;

use App\Models\SocialAccount;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

/**
 * Builds Mastodon API payloads and fakes an instance's home timeline, for browser tests
 * that need real posts flowing through FeedAggregator without a network.
 */
class FakeMastodon
{
    /**
     * A minimal text-only status in the shape GET /api/v1/timelines/home returns.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    public static function status(string $id, string $text, string $createdAt, array $overrides = []): array
    {
        return array_merge([
            'id' => $id,
            'created_at' => $createdAt,
            'url' => "https://social.example/@author/{$id}",
            'content' => "<p>{$text}</p>",
            'sensitive' => false,
            'spoiler_text' => '',
            'visibility' => 'public',
            'replies_count' => 0,
            'in_reply_to_id' => null,
            'quote_id' => null,
            'mentions' => [],
            'media_attachments' => [],
            'tags' => [],
            'emojis' => [],
            'card' => null,
            'poll' => null,
            'reblog' => null,
            'account' => [
                'id' => "account-{$id}",
                'username' => 'author',
                'acct' => 'author@social.example',
                'display_name' => 'Test Author',
                'avatar' => '',
                'header' => '',
                'emojis' => [],
            ],
        ], $overrides);
    }

    /**
     * Fake each account's home timeline. A request with max_id gets an empty page, as the
     * real API does once you page past the end — without that, the feed's refill would
     * keep re-requesting the same page. Any other outbound request gets a 404.
     *
     * @param  array<int, array{0: SocialAccount, 1: array<int, array<string, mixed>>}>  $timelines
     */
    public static function fakeTimelines(array $timelines): void
    {
        $fakes = [];

        foreach ($timelines as [$account, $statuses]) {
            $fakes[$account->instance_url.'/api/v1/timelines/home*'] = fn (Request $request) => Http::response(
                isset($request->data()['max_id']) ? [] : $statuses,
            );
        }

        $fakes['*'] = Http::response([], 404);

        Http::fake($fakes);
    }
}
