<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class MastodonController extends Controller
{
    public function __construct(private MastodonOAuthService $oauth) {}

    public function redirect(Request $request)
    {
        // Clear any stale reauth key so a fresh connect never triggers the reauth path in callback
        session()->forget('mastodon_reauth_account_id');

        $raw = $request->input('instance_url', '');
        if ($raw && ! str_contains($raw, '://')) {
            $request->merge(['instance_url' => 'https://'.$raw]);
        }

        $request->validate(['instance_url' => 'required|url']);

        $instance = rtrim($request->input('instance_url'), '/');

        $authorizeUrl = $this->startOAuthFlow($instance);

        return Inertia::location($authorizeUrl);
    }

    public function redirectReauth(Request $request, SocialAccount $account)
    {
        abort_if(
            $account->user_id !== $request->user()->id || $account->provider !== 'mastodon',
            403,
        );

        session(['mastodon_reauth_account_id' => $account->id]);

        $authorizeUrl = $this->startOAuthFlow($account->instance_url);

        return Inertia::location($authorizeUrl);
    }

    public function callback(Request $request)
    {
        $request->validate(['code' => 'required|string', 'state' => 'required|string']);

        $expectedState = session()->pull('mastodon_oauth_state');

        if (! $expectedState || ! hash_equals($expectedState, $request->input('state'))) {
            abort(422, 'Invalid OAuth state.');
        }

        $instance = session('mastodon_instance');
        $credentials = $this->oauth->getStoredCredentials($instance);

        $result = $this->oauth->exchangeCode(
            instance: $instance,
            code: $request->input('code'),
            clientId: $credentials['client_id'],
            clientSecret: $credentials['client_secret'],
            redirectUri: route('mastodon.callback'),
        );

        $reAuthAccountId = session()->pull('mastodon_reauth_account_id');

        if ($reAuthAccountId) {
            // Scope to provider + instance to prevent a stale key updating the wrong account
            $account = $request->user()->socialAccounts()
                ->where('provider', 'mastodon')
                ->where('instance_url', $instance)
                ->find($reAuthAccountId);

            if ($account) {
                $account->update([
                    'access_token' => $result['access_token'],
                    'handle' => $result['handle'],
                    'auth_failed_at' => null,
                ]);

                return redirect()->route('connections.edit')
                    ->with('status', 'mastodon-reconnected');
            }
        }

        $exists = $request->user()->socialAccounts()
            ->where('provider', 'mastodon')
            ->where('instance_url', $instance)
            ->where('handle', $result['handle'])
            ->exists();

        if ($exists) {
            return redirect()->route('connections.edit')
                ->with('status', 'mastodon-already-connected');
        }

        $request->user()->socialAccounts()->create([
            'provider' => 'mastodon',
            'instance_url' => $instance,
            'access_token' => $result['access_token'],
            'handle' => $result['handle'],
        ]);

        return redirect()->route('connections.edit')
            ->with('status', 'mastodon-connected');
    }

    public function instances(Request $request): JsonResponse
    {
        $q = strtolower(trim($request->string('q')->toString()));

        if (mb_strlen($q) < 2) {
            return response()->json([]);
        }

        $servers = Cache::get('mastodon_servers_list');

        if ($servers === null) {
            try {
                $response = Http::timeout(5)->get('https://api.joinmastodon.org/servers');
                if ($response->successful()) {
                    $servers = $response->json() ?? [];
                    Cache::put('mastodon_servers_list', $servers, 86400);
                } else {
                    Log::warning('Mastodon server list fetch returned non-success', [
                        'status' => $response->status(),
                    ]);
                    $servers = [];
                }
            } catch (ConnectionException $e) {
                Log::warning('Mastodon server list fetch failed', [
                    'message' => $e->getMessage(),
                ]);
                $servers = [];
            }
        }

        $matches = collect($servers)
            ->filter(fn ($s) => str_contains(strtolower($s['domain'] ?? ''), $q)
                || str_contains(strtolower($s['description'] ?? ''), $q))
            ->take(8)
            ->map(fn ($s) => [
                'name' => $s['domain'] ?? '',
                'description' => trim(str_replace(["\r\n", "\r", "\n"], ' ', $s['description'] ?? '')),
            ])
            ->values();

        return response()->json($matches);
    }

    private function startOAuthFlow(string $instance): string
    {
        $instance = rtrim($instance, '/');

        $this->validateInstanceUrl($instance);

        session(['mastodon_instance' => $instance]);

        try {
            return $this->oauth->getAuthorizeUrl($instance, route('mastodon.callback'));
        } catch (ConnectionException) {
            throw ValidationException::withMessages([
                'instance_url' => 'Could not connect to that Mastodon instance. Check the URL and try again.',
            ]);
        } catch (\Exception $e) {
            Log::error('Unexpected error during Mastodon OAuth setup', [
                'instance' => $instance,
                'exception' => get_class($e),
                'message' => $e->getMessage(),
            ]);
            throw ValidationException::withMessages([
                'instance_url' => 'That doesn\'t appear to be a Mastodon instance.',
            ]);
        }
    }

    private function validateInstanceUrl(string $url): void
    {
        $parsed = parse_url($url);

        if (! $parsed || ($parsed['scheme'] ?? '') !== 'https') {
            throw ValidationException::withMessages(['instance_url' => 'Instance URL must use HTTPS.']);
        }

        $host = $parsed['host'] ?? '';
        $ip = gethostbyname($host);

        if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw ValidationException::withMessages(['instance_url' => 'Could not resolve that domain. Check the URL and try again.']);
        }
    }
}
