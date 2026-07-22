<?php

namespace Database\Factories;

use App\Models\SocialAccount;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SocialAccount>
 */
class SocialAccountFactory extends Factory
{
    public function definition(): array
    {
        $provider = fake()->randomElement(['mastodon', 'bluesky']);

        return [
            'user_id' => User::factory(),
            'provider' => $provider,
            'feed_type' => 'home',
            'instance_url' => $provider === 'bluesky' ? 'https://bsky.social' : 'https://'.fake()->domainName(),
            'access_token' => fake()->sha256(),
            'token_secret' => null,
            'handle' => $provider === 'bluesky'
                ? '@'.fake()->userName().'.bsky.social'
                : '@'.fake()->userName().'@'.fake()->domainName(),
            'auth_failed_at' => null,
        ];
    }

    public function publicMastodon(string $instanceUrl = 'https://social.example'): static
    {
        return $this->state([
            'provider' => 'mastodon',
            'feed_type' => 'public_mastodon',
            'instance_url' => $instanceUrl,
            'access_token' => null,
            'handle' => null,
        ]);
    }

    public function blueskyFeed(string $feedUri = 'at://did:plc:test/app.bsky.feed.generator/whats-hot', ?string $feedName = null): static
    {
        return $this->state([
            'provider' => 'bluesky',
            'feed_type' => 'bluesky_feed',
            'instance_url' => 'https://pds.example',
            'access_token' => null,
            'handle' => null,
            'feed_settings' => array_filter([
                'feed_uri' => $feedUri,
                'feed_name' => $feedName,
            ], fn ($value) => $value !== null),
        ]);
    }
}
