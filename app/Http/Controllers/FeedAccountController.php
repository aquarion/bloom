<?php

namespace App\Http\Controllers;

use App\Models\SocialAccount;
use App\Services\Feed\FeedAggregator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FeedAccountController extends Controller
{
    public function __construct(private FeedAggregator $aggregator) {}

    public function show(Request $request, SocialAccount $account): JsonResponse
    {
        $user = $request->user();
        abort_unless($account->user_id === $user->id, 403);

        $cursor = is_string($request->query('cursor')) ? $request->query('cursor') : null;

        $result = $this->aggregator->fetchAccount($user, $account, $cursor, mentionsEnabled: true);

        $posts = $this->aggregator->applyMuteWords($result['posts'], $user->getPreference('mute_words', []));
        $posts = $this->aggregator->applyCwWhitelist($posts, $user->getPreference('cw_label_whitelist', []));

        return response()->json(['posts' => $posts, 'next_cursor' => $result['next_cursor']]);
    }
}
