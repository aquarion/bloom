<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Services\Mastodon\MastodonOAuthService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class MastodonController extends Controller
{
    public function __construct(private MastodonOAuthService $oauth) {}

    public function redirect(Request $request)
    {
        $raw = $request->input('instance_url', '');
        if ($raw && ! str_contains($raw, '://')) {
            $request->merge(['instance_url' => 'https://'.$raw]);
        }

        $request->validate(['instance_url' => 'required|url']);

        $instance = rtrim($request->input('instance_url'), '/');

        $this->validateInstanceUrl($instance);

        $redirectUri = route('mastodon.callback');

        session(['mastodon_instance' => $instance]);

        try {
            $authorizeUrl = $this->oauth->getAuthorizeUrl($instance, $redirectUri);
        } catch (ConnectionException) {
            throw ValidationException::withMessages([
                'instance_url' => 'Could not connect to that Mastodon instance. Check the URL and try again.',
            ]);
        } catch (\Exception) {
            throw ValidationException::withMessages([
                'instance_url' => 'That doesn\'t appear to be a Mastodon instance.',
            ]);
        }

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
