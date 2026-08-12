<?php

namespace App\Http\Controllers;

use App\Services\Feed\FeedAggregator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Inertia\Inertia;

class FeedController extends Controller
{
    public function __construct(private FeedAggregator $aggregator) {}

    public function index(Request $request)
    {
        $user = $request->user();

        // Fetching posts means synchronous round-trips to each connected
        // provider's API, which can take a while — deferring initialPosts/
        // initialCursor lets the page shell render immediately instead of
        // blocking the whole response on it. Both props share this same
        // memoized closure so the fetch only happens once when Inertia
        // resolves them together on the follow-up request.
        $result = null;
        $fetch = function () use (&$result, $user) {
            return $result ??= $this->aggregator->fetch($user, mentionsEnabled: true);
        };

        if ($request->wantsJson()) {
            return response()->json($fetch());
        }

        return Inertia::render('feed', [
            'initialPosts' => Inertia::defer(fn () => $fetch()['posts']),
            'initialCursor' => Inertia::defer(fn () => $fetch()['next_cursor']),
            'debugEnabled' => Config::get('app.debug', false),
            'cwBehavior' => $user->getPreference('cw_behavior', 'blur'),
            'sensitiveMediaBehavior' => $user->getPreference('sensitive_media_behavior', 'blur'),
            'cwAuthorWhitelist' => $user->getPreference('cw_author_whitelist', []),
        ]);
    }
}
