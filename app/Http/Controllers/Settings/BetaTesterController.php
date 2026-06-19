<?php

namespace App\Http\Controllers\Settings;

use App\Enums\Role;
use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

class BetaTesterController extends Controller
{
    public function update(Request $request): RedirectResponse
    {
        $request->validate(['beta_tester' => ['required', 'boolean']]);

        $user = $request->user();

        if ($request->boolean('beta_tester')) {
            $user->addRole(Role::BetaTester);
        } else {
            $user->removeRole(Role::BetaTester);
        }

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Preferences updated.')]);

        return to_route('profile.edit');
    }
}
