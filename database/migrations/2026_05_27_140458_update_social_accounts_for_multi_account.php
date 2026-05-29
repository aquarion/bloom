<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill instance_url for existing Bluesky rows (created before instance_url was required)
        DB::table('social_accounts')
            ->where('provider', 'bluesky')
            ->whereNull('instance_url')
            ->update(['instance_url' => 'https://bsky.social']);

        Schema::table('social_accounts', function (Blueprint $table) {
            // Drop the old one-account-per-provider constraint
            $table->dropUnique(['user_id', 'provider']);

            // Add per-handle uniqueness constraint
            $table->unique(['user_id', 'provider', 'instance_url', 'handle']);

            // Add auth failure timestamp
            $table->timestamp('auth_failed_at')->nullable()->after('handle');
        });
    }

    public function down(): void
    {
        Schema::table('social_accounts', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'provider', 'instance_url', 'handle']);
            $table->dropColumn('auth_failed_at');
            // NOTE: Only safe if no multi-account data exists.
            $table->unique(['user_id', 'provider']);
        });
    }
};
