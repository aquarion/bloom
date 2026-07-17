<?php

namespace App\Console\Commands;

use App\Mail\AccountTombstoned;
use App\Models\Tombstone;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class TombstoneInactiveAccounts extends Command
{
    protected $signature = 'accounts:tombstone-inactive';

    protected $description = 'Archive and delete accounts that have been inactive past the tombstone threshold.';

    public function handle(): int
    {
        $cutoff = now()->subDays(config('inactivity.tombstone_after_days'));

        User::query()
            ->whereNotNull('last_active_at')
            ->where('last_active_at', '<=', $cutoff)
            ->with(['passkeys', 'socialAccounts'])
            ->each(function (User $user) {
                try {
                    $this->tombstone($user);
                } catch (Throwable $e) {
                    Log::error('Failed to tombstone inactive account', [
                        'user_id' => $user->id,
                        'exception' => $e->getMessage(),
                    ]);
                }
            });

        return self::SUCCESS;
    }

    private function tombstone(User $user): void
    {
        DB::transaction(function () use ($user) {
            $archivedPasskeys = $user->passkeys->map(fn ($passkey) => [
                'credential_id' => $passkey->credential_id,
                'public_key' => $passkey->public_key,
                'sign_count' => $passkey->sign_count,
                'transports' => $passkey->transports,
                'name' => $passkey->name,
            ])->all();

            $archivedSocialAccounts = $user->socialAccounts
                ->map(fn ($account) => $account->toArchive())
                ->all();

            $user->cancelSubscription();

            Tombstone::create([
                'email' => $user->email,
                'name' => $user->name,
                'schema_version' => Tombstone::CURRENT_SCHEMA_VERSION,
                'archived_passkeys' => $archivedPasskeys,
                'archived_social_accounts' => $archivedSocialAccounts,
                'original_user_id' => $user->id,
                'tombstoned_at' => now(),
            ]);

            Mail::to($user->email)->send(new AccountTombstoned($user->name));

            $user->delete();
        });
    }
}
