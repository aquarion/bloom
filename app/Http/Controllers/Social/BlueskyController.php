<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Bluesky\BlueskyAuthService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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

        $result = $this->attemptCreateSession(
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

    public function update(Request $request, SocialAccount $account)
    {
        abort_if($account->user_id !== $request->user()->id || $account->provider !== 'bluesky', 403);

        $request->validate(['app_password' => 'required|string']);

        $result = $this->attemptCreateSession(
            $account->handle,
            $request->input('app_password'),
            $account->instance_url ?? 'https://bsky.social',
        );

        $account->update([
            'access_token' => $result['access_token'],
            'token_secret' => $result['refresh_token'],
            'handle' => $result['handle'],
            'auth_failed_at' => null,
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'bluesky-reconnected');
    }

    private function attemptCreateSession(string $handle, string $appPassword, string $pdsUrl): array
    {
        try {
            return $this->auth->createSession($handle, $appPassword, $pdsUrl);
        } catch (ConnectionException) {
            throw ValidationException::withMessages(['app_password' => 'Could not connect to Bluesky. Please try again.']);
        } catch (RequestException $e) {
            $message = $e->response->status() === 401
                ? 'Invalid handle or app password.'
                : 'Could not connect to Bluesky. Please try again.';

            if ($e->response->status() !== 401) {
                Log::warning('Bluesky createSession returned unexpected HTTP error', [
                    'status' => $e->response->status(),
                ]);
            }

            throw ValidationException::withMessages(['app_password' => $message]);
        }
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
