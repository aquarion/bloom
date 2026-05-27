<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Bluesky\BlueskyAuthService;
use Illuminate\Http\Request;

class BlueskyController extends Controller
{
    public function __construct(private BlueskyAuthService $auth) {}

    public function store(Request $request)
    {
        $request->validate([
            'handle' => 'required|string',
            'app_password' => 'required|string',
            'pds_url' => 'nullable|url',
        ]);

        $pdsUrl = $request->input('pds_url') ?: 'https://bsky.social';

        $result = $this->auth->createSession(
            $request->input('handle'),
            $request->input('app_password'),
            $pdsUrl,
        );

        $exists = $request->user()->socialAccounts()
            ->where('provider', 'bluesky')
            ->where('instance_url', $pdsUrl)
            ->where('handle', $result['handle'])
            ->exists();

        if ($exists) {
            return redirect()->route('connections.edit')
                ->with('status', 'bluesky-already-connected');
        }

        $request->user()->socialAccounts()->create([
            'provider' => 'bluesky',
            'instance_url' => $pdsUrl,
            'access_token' => $result['access_token'],
            'token_secret' => $result['refresh_token'],
            'handle' => $result['handle'],
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-connected');
    }

    public function destroy(Request $request, SocialAccount $account)
    {
        abort_unless($account->user_id === $request->user()->id, 403);

        $account->delete();

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-disconnected');
    }
}
