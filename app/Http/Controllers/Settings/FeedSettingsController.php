<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class FeedSettingsController extends Controller
{
    public function edit(Request $request): Response
    {
        return Inertia::render('settings/feed', [
            'preferences' => $request->user()->getPreferences(),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'max_age_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'mute_words' => ['nullable', 'array'],
            'mute_words.*' => ['string', 'max:100'],
            'cw_behavior' => ['required', Rule::in(['skip', 'blur', 'show'])],
            'sensitive_media_behavior' => ['required', Rule::in(['skip', 'blur', 'show'])],
            'cw_label_whitelist' => ['nullable', 'array'],
            'cw_label_whitelist.*' => [Rule::in(['adult', 'graphic', 'safety', 'generic'])],
            'cw_author_whitelist' => ['nullable', 'array'],
            'cw_author_whitelist.*' => ['string', 'max:255'],
        ]);

        $user = $request->user();
        $prefs = $user->getPreferences();
        $prefs['mute_words'] = $validated['mute_words'] ?? [];
        $prefs['cw_behavior'] = $validated['cw_behavior'];
        $prefs['sensitive_media_behavior'] = $validated['sensitive_media_behavior'];
        $prefs['cw_label_whitelist'] = $validated['cw_label_whitelist'] ?? [];
        if (array_key_exists('cw_author_whitelist', $validated)) {
            $prefs['cw_author_whitelist'] = $validated['cw_author_whitelist'];
        }
        if (array_key_exists('max_age_days', $validated)) {
            $prefs['max_age_days'] = $validated['max_age_days'];
        }
        $user->feed_preferences = $prefs;

        if (! $user->save()) {
            return back()->withErrors(['general' => 'Failed to save settings. Please try again.']);
        }

        return redirect()->route('feed.settings.edit')->with('status', 'feed-settings-updated');
    }

    /**
     * Persists a single author-level CW reveal from the feed so it stays revealed
     * on future visits, without disturbing the immersive feed page's own state —
     * called via a plain fetch from useCwState, not an Inertia visit.
     */
    public function whitelistAuthor(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'author_handle' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $whitelist = $user->getPreference('cw_author_whitelist', []);

        if (! in_array($validated['author_handle'], $whitelist, true)) {
            $whitelist[] = $validated['author_handle'];
            $user->setPreference('cw_author_whitelist', $whitelist);
        }

        return response()->json(null, 204);
    }

    public function updateAccount(Request $request, SocialAccount $account): RedirectResponse
    {
        Gate::authorize('update', $account);

        $validated = $request->validate([
            'max_posts' => ['required', 'integer', 'min:1', 'max:100'],
            'max_age_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $account->feed_settings = array_merge($account->getPreferences(), [
            'max_posts' => $validated['max_posts'],
            'max_age_days' => $validated['max_age_days'] ?? null,
        ]);

        if (! $account->save()) {
            return back()->withErrors(['general' => 'Failed to save account settings. Please try again.']);
        }

        return redirect()->route('connections.edit')->with('status', 'account-feed-settings-updated');
    }
}
