<?php

namespace App\Console\Commands;

use App\Mail\InactivityWarning;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class WarnInactiveAccounts extends Command
{
    protected $signature = 'accounts:warn-inactive';

    protected $description = 'Email users whose accounts are approaching the inactivity tombstone threshold.';

    public function handle(): int
    {
        $warningCutoff = now()->subDays(config('inactivity.warning_after_days'));
        $tombstoneCutoff = now()->subDays(config('inactivity.tombstone_after_days'));

        User::query()
            ->whereNotNull('last_active_at')
            ->where('last_active_at', '<=', $warningCutoff)
            ->where('last_active_at', '>', $tombstoneCutoff)
            ->whereNull('inactivity_warning_sent_at')
            ->eachById(function (User $user) {
                try {
                    Mail::to($user->email)->send(new InactivityWarning($user));
                    $user->update(['inactivity_warning_sent_at' => now()]);
                } catch (Throwable $e) {
                    Log::error('Failed to send inactivity warning email', [
                        'user_id' => $user->id,
                        'exception' => $e->getMessage(),
                    ]);
                }
            });

        return self::SUCCESS;
    }
}
