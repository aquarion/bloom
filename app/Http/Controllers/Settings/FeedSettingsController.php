<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
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
        ]);

        $user = $request->user();
        $user->feed_preferences = array_merge($user->getPreferences(), [
            'max_age_days' => $validated['max_age_days'] ?? null,
            'mute_words' => $validated['mute_words'] ?? [],
            'cw_behavior' => $validated['cw_behavior'],
            'sensitive_media_behavior' => $validated['sensitive_media_behavior'],
        ]);
        $user->save();

        return redirect()->route('feed.settings.edit')->with('status', 'feed-settings-updated');
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
        $account->save();

        return redirect()->route('connections.edit')->with('status', 'account-feed-settings-updated');
    }
}
