<?php

namespace App\Http\Controllers;

use App\Services\Feed\PostNormalizer;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;

class WelcomeController extends Controller
{
    private const DATA_KEY = 'welcome.posts.data';

    private const FRESH_KEY = 'welcome.posts.fresh';

    private const DATA_TTL = 7 * 24 * 3600;

    private const FRESH_TTL = 6 * 3600;

    public function __construct(private PostNormalizer $normalizer) {}

    public function index()
    {
        if (auth()->check()) {
            return redirect()->route('feed');
        }

        return Inertia::render('welcome', [
            'initialPosts' => $this->getPosts(),
            'canRegister' => true,
        ]);
    }

    private function getPosts(): array
    {
        $cached = Cache::get(self::DATA_KEY);

        if ($cached !== null && Cache::has(self::FRESH_KEY)) {
            return $cached;
        }

        try {
            $posts = $this->fetchAndNormalize();

            if (empty($posts)) {
                Log::warning('Welcome page post fetch returned no usable posts');
            } else {
                Cache::put(self::DATA_KEY, $posts, now()->addSeconds(self::DATA_TTL));
                Cache::put(self::FRESH_KEY, true, now()->addSeconds(self::FRESH_TTL));

                return $posts;
            }
        } catch (\Throwable $e) {
            Log::warning('Welcome page post fetch failed', ['error' => $e->getMessage()]);
        }

        if ($cached !== null) {
            return $cached;
        }

        return $this->fallbackPosts();
    }

    private function fetchAndNormalize(): array
    {
        $instance = config('feed.welcome_instance', 'mastodon.social');

        $statuses = Http::timeout(10)
            ->get("https://{$instance}/api/v1/timelines/public", [
                'limit' => 40,
            ])
            ->throw()
            ->json();

        $normalised = array_map(
            fn (array $status) => $this->normalizer->fromMastodon($status, $instance),
            $statuses,
        );

        return array_values(array_filter($normalised, fn (array $post) => $post['body'] !== ''));
    }

    private function fallbackPosts(): array
    {
        $now = now()->toIso8601String();

        return [
            [
                'id' => 'welcome_1',
                'source' => 'mastodon',
                'source_handle' => '',
                'author_name' => 'example_user',
                'author_handle' => '@example_user@example.social',
                'author_avatar' => '',
                'author_banner' => null,
                'body' => 'Just spotted a kingfisher by the canal. Those colours are absolutely unreal.',
                'media' => [],
                'created_at' => $now,
                'original_url' => '',
                'link_url' => null,
                'link_title' => null,
                'link_favicon' => null,
                'reply_to' => null,
                'quoted_post' => null,
                'boosted_by' => null,
                'boosted_by_avatar' => null,
                'boosted_by_handle' => null,
                'boosted_by_created_at' => null,
                'emojis' => [],
                'hashtags' => [],
            ],
            [
                'id' => 'welcome_2',
                'source' => 'mastodon',
                'source_handle' => '',
                'author_name' => 'example_user2',
                'author_handle' => '@example_user2@example.social',
                'author_avatar' => '',
                'author_banner' => null,
                'body' => 'Shipped a feature I\'d been putting off for weeks. Turns out it only took two hours.',
                'media' => [],
                'created_at' => $now,
                'original_url' => '',
                'link_url' => null,
                'link_title' => null,
                'link_favicon' => null,
                'reply_to' => null,
                'quoted_post' => null,
                'boosted_by' => null,
                'boosted_by_avatar' => null,
                'boosted_by_handle' => null,
                'boosted_by_created_at' => null,
                'emojis' => [],
                'hashtags' => [],
            ],
            [
                'id' => 'welcome_3',
                'source' => 'bluesky',
                'source_handle' => '',
                'author_name' => 'example_user3',
                'author_handle' => '@example_user3.bsky.social',
                'author_avatar' => '',
                'author_banner' => null,
                'body' => 'The thing I like most about the open web is that nobody owns the conversation.',
                'media' => [],
                'created_at' => $now,
                'original_url' => '',
                'link_url' => null,
                'link_title' => null,
                'link_favicon' => null,
                'reply_to' => null,
                'quoted_post' => null,
                'boosted_by' => null,
                'boosted_by_avatar' => null,
                'boosted_by_handle' => null,
                'boosted_by_created_at' => null,
                'emojis' => [],
                'hashtags' => [],
            ],
        ];
    }
}
