<?php

namespace App\Http\Controllers\Auth;

use App\Concerns\ProfileValidationRules;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class RegisteredUserController extends Controller
{
    use ProfileValidationRules;

    public function create(): Response
    {
        return Inertia::render('auth/register');
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate($this->profileRules());

        $user = User::create([
            'name' => $request->name,
            'email' => strtolower($request->email),
        ]);

        Auth::login($user);

        return redirect()->route('passkey.setup');
    }
}
