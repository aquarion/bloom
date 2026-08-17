<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Inertia\Inertia;

class FeedController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $user->loadMissing('socialAccounts');

        return Inertia::render('feed', [
            // Cheap (no provider API calls) — sent eagerly so the frontend can
            // immediately fire one request per account (see FeedAccountController)
            // instead of waiting on a single all-accounts fetch.
            'accounts' => $user->socialAccounts->map(fn ($account) => ['id' => $account->id])->values(),
            'feedBufferSize' => Config::get('feed.buffer_size', 200),
            'debugEnabled' => Config::get('app.debug', false),
            'cwBehavior' => $user->getPreference('cw_behavior', 'blur'),
            'sensitiveMediaBehavior' => $user->getPreference('sensitive_media_behavior', 'blur'),
            'cwAuthorWhitelist' => $user->getPreference('cw_author_whitelist', []),
            'reduceMotion' => $user->getPreference('reduce_motion', false),
        ]);
    }
}
