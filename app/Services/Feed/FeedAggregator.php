<?php

namespace App\Services\Feed;

use App\Models\SocialAccount;
use App\Models\User;
use App\Services\Bluesky\BlueskyFeedService;
use App\Services\Mastodon\MastodonFeedService;
use Illuminate\Support\Facades\Log;

class FeedAggregator
{
    public function __construct(
        private MastodonFeedService $mastodon,
        private BlueskyFeedService $bluesky,
        private PostNormalizer $normalizer,
    ) {}

    public function fetch(User $user, int $limit = 20, ?string $cursor = null): array
    {
        $user->loadMissing('socialAccounts');

        $cursors = $cursor ? json_decode(base64_decode($cursor), true) : [];
        $posts = collect();

        // Fetch configured number of posts from each provider for better proportional representation
        $perProviderLimit = config('feed.per_provider_limit', 20);

        foreach ($user->socialAccounts as $account) {
            $accountCursor = $cursors[$account->id] ?? null;

            try {
                if ($account->provider === 'mastodon') {
                    $host = parse_url($account->instance_url, PHP_URL_HOST);
                    $statuses = $this->mastodon->getHomeTimeline($account, $perProviderLimit, $accountCursor);

                    $parents = $this->fetchMastodonParents($account, $statuses);

                    $normalised = array_map(
                        fn ($s) => $this->normalizer->fromMastodon($s, $host, $parents[$s['in_reply_to_id'] ?? ''] ?? null, $account->handle),
                        $statuses
                    );
                    $nextCursor = ! empty($statuses) ? end($statuses)['id'] : null;
                    $posts = $posts->concat($normalised);
                    if ($nextCursor) {
                        $cursors[$account->id] = $nextCursor;
                    }
                }

                if ($account->provider === 'bluesky') {
                    $result = $this->bluesky->getHomeTimeline($account, $perProviderLimit, $accountCursor);
                    $normalised = array_map(fn ($p) => $this->normalizer->fromBluesky($p, $account->handle), $result['posts']);
                    $posts = $posts->concat($normalised);
                    if ($result['cursor']) {
                        $cursors[$account->id] = $result['cursor'];
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Failed to fetch feed for account', [
                    'account_id' => $account->id,
                    'provider' => $account->provider,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // Return configured buffer size to ensure both providers are well-represented
        $bufferSize = config('feed.buffer_size', 40);
        $sorted = $posts->sortByDesc('created_at')->values()->take($bufferSize)->all();
        $nextCursor = ! empty($sorted) ? base64_encode(json_encode($cursors)) : null;

        return ['posts' => $sorted, 'next_cursor' => $nextCursor];
    }

    /**
     * Build an id => status map for any in_reply_to_id values in the batch.
     * Statuses already present in the batch are used directly; only missing
     * parents are fetched from the API.
     */
    private function fetchMastodonParents(SocialAccount $account, array $statuses): array
    {
        $batchById = array_column($statuses, null, 'id');

        $replyIds = array_filter(array_unique(array_column($statuses, 'in_reply_to_id')));

        $parents = [];
        foreach ($replyIds as $id) {
            if (isset($batchById[$id])) {
                $parents[$id] = $batchById[$id];
            } else {
                $fetched = $this->mastodon->getStatus($account, $id);
                if ($fetched !== null) {
                    $parents[$id] = $fetched;
                }
            }
        }

        return $parents;
    }
}
