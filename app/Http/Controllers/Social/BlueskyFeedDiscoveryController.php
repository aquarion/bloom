<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Bluesky\BlueskyFeedService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class BlueskyFeedDiscoveryController extends Controller
{
    public function __construct(private BlueskyFeedService $feeds) {}

    public function index(Request $request)
    {
        $homeAccount = $this->homeAccount($request);

        if ($homeAccount === null) {
            return redirect()->route('connections.edit');
        }

        return Inertia::render('settings/bluesky-feeds', [
            'popularFeeds' => $this->feeds->searchFeedGenerators($homeAccount, null, 6),
            'status' => $request->session()->get('status'),
        ]);
    }

    public function search(Request $request)
    {
        $homeAccount = $this->homeAccount($request);

        abort_if($homeAccount === null, 403);

        $validated = $request->validate([
            'q' => 'nullable|string|max:100',
        ]);

        return response()->json([
            'feeds' => $this->feeds->searchFeedGenerators($homeAccount, $validated['q'] ?? null, 10),
        ]);
    }

    private function homeAccount(Request $request): ?SocialAccount
    {
        return $request->user()->socialAccounts()
            ->where('provider', 'bluesky')
            ->where('feed_type', 'home')
            ->orderBy('id')
            ->first();
    }
}
