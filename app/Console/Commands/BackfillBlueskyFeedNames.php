<?php

namespace App\Console\Commands;

use App\Models\SocialAccount;
use App\Services\Bluesky\BlueskyFeedService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

class BackfillBlueskyFeedNames extends Command
{
    protected $signature = 'bluesky:backfill-feed-names';

    protected $description = "Resolve and store each existing algorithmic feed connection's real name, replacing the home handle placeholder on its SourceID badge.";

    public function __construct(private BlueskyFeedService $feeds)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $resolved = 0;
        $skipped = 0;

        SocialAccount::query()
            ->where('provider', 'bluesky')
            ->where('feed_type', 'bluesky_feed')
            ->whereNull('feed_settings->feed_name')
            ->with('user.socialAccounts')
            ->eachById(function (SocialAccount $account) use (&$resolved, &$skipped) {
                $feedUri = $account->getPreference('feed_uri');

                if (empty($feedUri)) {
                    $skipped++;

                    return;
                }

                $homeAccount = $account->user->socialAccounts
                    ->where('provider', 'bluesky')
                    ->where('feed_type', 'home')
                    ->sortBy('id')
                    ->first();

                if ($homeAccount === null) {
                    $skipped++;

                    return;
                }

                try {
                    $generator = $this->feeds->resolveFeedGenerator($homeAccount, $feedUri);
                } catch (Throwable $e) {
                    $skipped++;
                    Log::warning('Failed to resolve feed generator during backfill', [
                        'account_id' => $account->id,
                        'exception' => $e::class,
                        'error' => $e->getMessage(),
                    ]);

                    return;
                }

                if ($generator === null || $generator['display_name'] === '') {
                    $skipped++;

                    return;
                }

                $account->setPreference('feed_name', $generator['display_name']);
                $resolved++;
            });

        $this->info("Resolved {$resolved} feed name(s), {$skipped} skipped.");

        return self::SUCCESS;
    }
}
