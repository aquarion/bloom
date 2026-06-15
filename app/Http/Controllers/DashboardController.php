<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;

class DashboardController extends Controller
{
    public function __invoke(): RedirectResponse
    {
        if (auth()->user()->socialAccounts()->exists()) {
            return redirect()->route('feed');
        }

        return redirect()->route('connections.edit');
    }
}
