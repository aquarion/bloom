<?php

use App\Console\Commands\TombstoneInactiveAccounts;
use App\Console\Commands\WarnInactiveAccounts;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command(WarnInactiveAccounts::class)->daily();
Schedule::command(TombstoneInactiveAccounts::class)->daily();
