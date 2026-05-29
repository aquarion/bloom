<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Services\Bluesky\BlueskyAuthService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class BlueskyController extends Controller
{
    public function __construct(private BlueskyAuthService $auth) {}

    public function store(Request $request)
    {
        $request->validate([
            'handle' => 'required|string',
            'app_password' => 'required|string',
            'pds_url' => 'nullable|url|starts_with:https://',
        ]);

        $pdsUrl = $request->input('pds_url') ?: 'https://bsky.social';

        if ($request->filled('pds_url')) {
            $this->validatePdsUrl($pdsUrl);
        }

        try {
            $result = $this->auth->createSession(
                $request->input('handle'),
                $request->input('app_password'),
                $pdsUrl,
            );
        } catch (ConnectionException) {
            throw ValidationException::withMessages(['app_password' => 'Could not connect to Bluesky. Please try again.']);
        } catch (RequestException $e) {
            $message = $e->response->status() === 401
                ? 'Invalid handle or app password.'
                : 'Could not connect to Bluesky. Please try again.';

            throw ValidationException::withMessages(['app_password' => $message]);
        }

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

    private function validatePdsUrl(string $url): void
    {
        $parsed = parse_url($url);

        if (! $parsed || ($parsed['scheme'] ?? '') !== 'https') {
            throw ValidationException::withMessages(['pds_url' => 'PDS URL must use HTTPS.']);
        }

        $host = $parsed['host'] ?? '';
        $ip = gethostbyname($host);

        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw ValidationException::withMessages(['pds_url' => 'PDS URL is not allowed.']);
        }
    }
}
