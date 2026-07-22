<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Bluesky\BlueskyFeedService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class ConnectionsController extends Controller
{
    public function __construct(private BlueskyFeedService $feeds) {}

    public function edit(Request $request)
    {
        $homeAccount = $request->user()->socialAccounts()
            ->where('provider', 'bluesky')
            ->where('feed_type', 'home')
            ->orderBy('id')
            ->first();

        $connections = $request->user()->socialAccounts()
            ->select('id', 'provider', 'feed_type', 'handle', 'instance_url', 'auth_failed_at', 'feed_settings')
            ->get()
            ->map(function (SocialAccount $account) use ($homeAccount) {
                $attributes = $account->toArray();

                if ($account->feed_type !== 'bluesky_feed' || $homeAccount === null) {
                    return $attributes;
                }

                // Resolved live (cache-backed, see BlueskyFeedService) rather than persisted
                // like feed_name — this is a cold, occasionally-visited page, so it's worth
                // self-healing if the feed's avatar or owner changes, unlike feed_name which
                // sits in the per-post hot path and can't afford a live call there.
                $feedUri = $account->getPreference('feed_uri');
                $generator = $feedUri ? $this->feeds->resolveFeedGenerator($homeAccount, $feedUri) : null;

                $attributes['feed_avatar'] = $generator['avatar'] ?? null;
                $attributes['feed_creator_handle'] = $generator['creator_handle'] ?? null;

                return $attributes;
            });

        return Inertia::render('settings/connections', [
            'connections' => $connections,
            'status' => $request->session()->get('status'),
        ]);
    }

    public function storePublicMastodon(Request $request)
    {
        $request->validate([
            'instance_url' => 'required|url|starts_with:https://',
        ]);

        $instanceUrl = rtrim($request->input('instance_url'), '/');

        $this->validateInstanceUrl($instanceUrl);

        $exists = $request->user()->socialAccounts()
            ->where('provider', 'mastodon')
            ->where('feed_type', 'public_mastodon')
            ->where('instance_url', $instanceUrl)
            ->exists();

        if ($exists) {
            return redirect()->route('connections.edit')
                ->with('status', 'public-mastodon-already-added');
        }

        $request->user()->socialAccounts()->create([
            'provider' => 'mastodon',
            'feed_type' => 'public_mastodon',
            'instance_url' => $instanceUrl,
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'public-mastodon-added');
    }

    public function storeBlueskyFeed(Request $request)
    {
        $request->validate([
            'feed_url' => 'required|string',
        ]);

        $homeAccount = $request->user()->socialAccounts()
            ->where('provider', 'bluesky')
            ->where('feed_type', 'home')
            ->orderBy('id')
            ->first();

        if ($homeAccount === null) {
            throw ValidationException::withMessages([
                'feed_url' => 'You need a connected Bluesky account to subscribe to algorithmic feeds.',
            ]);
        }

        $feedUri = $this->blueskyFeedUrlToAtUri($request->input('feed_url'));

        $exists = $request->user()->socialAccounts()
            ->where('provider', 'bluesky')
            ->where('feed_type', 'bluesky_feed')
            ->whereJsonContains('feed_settings->feed_uri', $feedUri)
            ->exists();

        if ($exists) {
            return redirect()->route('connections.edit')
                ->with('status', 'bluesky-feed-already-added');
        }

        $generator = $this->feeds->resolveFeedGenerator($homeAccount, $feedUri);

        if ($generator === null) {
            throw ValidationException::withMessages([
                'feed_url' => "That feed couldn't be found. Check the URL and try again.",
            ]);
        }

        $request->user()->socialAccounts()->create([
            'provider' => 'bluesky',
            'feed_type' => 'bluesky_feed',
            'instance_url' => 'https://bsky.social',
            'feed_settings' => ['feed_uri' => $feedUri, 'feed_name' => $generator['display_name']],
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-feed-added');
    }

    public function destroy(Request $request, SocialAccount $account)
    {
        abort_unless($account->user_id === $request->user()->id, 403);

        $provider = $account->provider;

        $account->delete();

        return redirect()->route('connections.edit')
            ->with('status', $provider.'-disconnected');
    }

    private function validateInstanceUrl(string $url): void
    {
        $parsed = parse_url($url);

        if (! $parsed || ($parsed['scheme'] ?? '') !== 'https') {
            throw ValidationException::withMessages(['instance_url' => 'Instance URL must use HTTPS.']);
        }

        $host = $parsed['host'] ?? '';

        // If the host is a bare IP address, reject private/reserved ranges immediately.
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if (! filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                throw ValidationException::withMessages(['instance_url' => 'Instance URL is not allowed.']);
            }

            return;
        }

        // For hostnames, resolve and check the resulting IP (skip in unit tests where DNS is unavailable).
        if (! app()->runningUnitTests()) {
            $ip = gethostbyname($host);

            // gethostbyname returns the input unchanged when resolution fails.
            if ($ip === $host) {
                throw ValidationException::withMessages(['instance_url' => 'Could not resolve that domain. Check the URL and try again.']);
            }

            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                Log::warning('Blocked instance URL resolving to private/reserved IP', ['host' => $host, 'ip' => $ip]);
                throw ValidationException::withMessages(['instance_url' => 'Instance URL is not allowed.']);
            }
        }
    }

    private function blueskyFeedUrlToAtUri(string $input): string
    {
        if (str_starts_with($input, 'at://')) {
            return $input;
        }

        if (preg_match('#^https://bsky\.app/profile/([^/]+)/feed/([^/]+)$#', $input, $m)) {
            return "at://{$m[1]}/app.bsky.feed.generator/{$m[2]}";
        }

        throw ValidationException::withMessages([
            'feed_url' => 'Please enter a valid Bluesky feed URL (https://bsky.app/profile/.../feed/...) or AT URI.',
        ]);
    }
}
