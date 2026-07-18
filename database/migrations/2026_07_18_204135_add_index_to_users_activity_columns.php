<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * WarnInactiveAccounts filters on a `last_active_at` range plus
     * `whereNull('inactivity_warning_sent_at')`, and TombstoneInactiveAccounts
     * filters on `last_active_at` alone — both scheduled commands run daily
     * full-table scans without this composite index.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->index(['last_active_at', 'inactivity_warning_sent_at'], 'users_last_active_at_inactivity_warning_sent_at_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_last_active_at_inactivity_warning_sent_at_index');
        });
    }
};
