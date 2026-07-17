<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\Tombstone;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * SECURITY INVARIANT: `tombstone_id` and `tombstone_credential_id` must only ever be set in
 * session after genuine identity verification — e.g. a successful WebAuthn assertion against
 * an archived account's passkey (PasskeyAuthController), or consuming a single-use
 * TombstoneRecoveryToken. This controller trusts those session values as already-verified;
 * it does not re-verify identity itself. Any code that sets these session keys MUST verify
 * identity first.
 */
class TombstoneController extends Controller
{
    public function show(Request $request): RedirectResponse|Response
    {
        $tombstone = $this->resolveSessionTombstone($request);

        if (! $tombstone) {
            return redirect()->route('login');
        }

        return Inertia::render('auth/tombstone', [
            'name' => $tombstone->name,
            'email' => $tombstone->email,
        ]);
    }

    public function destroy(Request $request): RedirectResponse
    {
        $tombstone = $this->resolveSessionTombstone($request);

        if (! $tombstone) {
            return redirect()->route('login');
        }

        $tombstone->delete();
        $request->session()->forget(['tombstone_id', 'tombstone_credential_id']);

        return redirect()->route('login')->with('status', 'account-deleted');
    }

    public function resurrect(Request $request): RedirectResponse
    {
        $id = $request->session()->get('tombstone_id');

        if (! $id) {
            return redirect()->route('login');
        }

        $verifiedCredentialId = $request->session()->get('tombstone_credential_id');

        try {
            $user = DB::transaction(function () use ($id, $verifiedCredentialId) {
                $tombstone = Tombstone::whereKey($id)->lockForUpdate()->first();

                if (! $tombstone) {
                    return null;
                }

                $user = User::create([
                    'name' => $tombstone->name,
                    'email' => $tombstone->email,
                    'last_active_at' => now(),
                ]);

                $archivedPasskey = $verifiedCredentialId
                    ? $tombstone->findArchivedPasskey($verifiedCredentialId)
                    : null;

                if ($archivedPasskey) {
                    $user->passkeys()->create([
                        'name' => $archivedPasskey['name'],
                        'credential_id' => $archivedPasskey['credential_id'],
                        'public_key' => $archivedPasskey['public_key'],
                        'sign_count' => $archivedPasskey['sign_count'],
                        'transports' => $archivedPasskey['transports'],
                    ]);
                }

                foreach ($tombstone->archivedSocialAccounts() as $archivedAccount) {
                    $user->socialAccounts()->create(
                        SocialAccount::rehydrate($archivedAccount, $tombstone->schema_version)
                    );
                }

                $tombstone->delete();

                return $user;
            });
        } catch (QueryException $e) {
            $request->session()->forget(['tombstone_id', 'tombstone_credential_id']);

            return redirect()->route('login')->with('status', 'account-already-exists');
        }

        $request->session()->forget(['tombstone_id', 'tombstone_credential_id']);

        if (! $user) {
            return redirect()->route('login');
        }

        Auth::login($user);

        Inertia::flash('toast', [
            'type' => 'success',
            'message' => __('Welcome back! Please reconnect your social accounts.'),
        ]);

        return redirect()->route('feed');
    }

    private function resolveSessionTombstone(Request $request): ?Tombstone
    {
        $id = $request->session()->get('tombstone_id');

        return $id ? Tombstone::find($id) : null;
    }
}
