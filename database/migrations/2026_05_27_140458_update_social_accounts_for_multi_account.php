<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill (idempotent: WHERE clause skips rows already updated)
        DB::table('social_accounts')
            ->where('provider', 'bluesky')
            ->whereNull('instance_url')
            ->update(['instance_url' => 'https://bsky.social']);

        $indexes = collect(Schema::getIndexes('social_accounts'))->pluck('name');

        // Add new unique index if not already present.
        // Must come before dropUnique: MySQL (error 1553) refuses to drop an index that
        // is the only one covering a FK column; the new index also starts with user_id.
        if (! $indexes->contains('social_accounts_user_id_provider_instance_url_handle_unique')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->unique(['user_id', 'provider', 'instance_url', 'handle']);
            });
        }

        if (! Schema::hasColumn('social_accounts', 'auth_failed_at')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->timestamp('auth_failed_at')->nullable()->after('handle');
            });
        }

        // Drop old index once the new one exists to satisfy the FK requirement.
        if ($indexes->contains('social_accounts_user_id_provider_unique')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropUnique(['user_id', 'provider']);
            });
        }
    }

    public function down(): void
    {
        $indexes = collect(Schema::getIndexes('social_accounts'))->pluck('name');

        if (! $indexes->contains('social_accounts_user_id_provider_unique')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->unique(['user_id', 'provider']);
            });
        }

        if ($indexes->contains('social_accounts_user_id_provider_instance_url_handle_unique')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropUnique(['user_id', 'provider', 'instance_url', 'handle']);
            });
        }

        if (Schema::hasColumn('social_accounts', 'auth_failed_at')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropColumn('auth_failed_at');
            });
        }
    }
};
