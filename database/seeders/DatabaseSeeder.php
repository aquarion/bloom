<?php

namespace Database\Seeders;

use App\Models\User;
use App\Services\Feed\FeedDemoFixtures;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        $user = User::factory()->create([
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);

        if (config('feed.demo_mode')) {
            $this->seedDemoFeedAccounts($user);
        }
    }

    /**
     * Connects $user to a fixture-backed Mastodon and Bluesky account, so the feed has
     * representative content to preview locally without a real connected account. Only
     * meaningful alongside config('feed.demo_mode') — see FeedDemoFixtures.
     */
    private function seedDemoFeedAccounts(User $user): void
    {
        $user->socialAccounts()->create([
            'provider' => 'mastodon',
            'feed_type' => 'home',
            'instance_url' => FeedDemoFixtures::MASTODON_INSTANCE,
            'access_token' => FeedDemoFixtures::MASTODON_ACCESS_TOKEN,
            'handle' => FeedDemoFixtures::MASTODON_HANDLE,
        ]);

        $user->socialAccounts()->create([
            'provider' => 'bluesky',
            'feed_type' => 'home',
            'instance_url' => FeedDemoFixtures::BLUESKY_PDS,
            'access_token' => FeedDemoFixtures::BLUESKY_ACCESS_TOKEN,
            'handle' => FeedDemoFixtures::BLUESKY_HANDLE,
        ]);
    }
}
