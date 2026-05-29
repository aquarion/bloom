<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Backfill (idempotent: WHERE skips rows already updated)
        DB::table('social_accounts')
            ->where('provider', 'bluesky')
            ->whereNull('instance_url')
            ->update(['instance_url' => 'https://bsky.social']);

        // Add the new per-handle unique index first.
        // Must precede the dropUnique below: MySQL (error 1553) refuses to drop an index
        // that is the sole one covering a FK column. The new index also starts with user_id.
        // Catch 1061/duplicate so re-runs after a partial failure don't abort here.
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->unique(['user_id', 'provider', 'instance_url', 'handle']);
            });
        } catch (QueryException $e) {
            // MySQL 1061 = duplicate key name; SQLite = "already exists"
            if (! str_contains($e->getMessage(), 'Duplicate key name')
                && ! str_contains($e->getMessage(), 'already exists')) {
                throw $e;
            }
        }

        if (! Schema::hasColumn('social_accounts', 'auth_failed_at')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->timestamp('auth_failed_at')->nullable()->after('handle');
            });
        }

        // Now safe to drop the old index: the new one already covers user_id for the FK.
        // Catch 1091/missing so re-runs after a partial failure don't abort here.
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropUnique(['user_id', 'provider']);
            });
        } catch (QueryException $e) {
            // MySQL 1091 = can't drop, key doesn't exist; SQLite = "no such index"
            if (! str_contains($e->getMessage(), "Can't DROP")
                && ! str_contains($e->getMessage(), 'no such index')) {
                throw $e;
            }
        }
    }

    public function down(): void
    {
        // Re-add the old index before dropping the new one (same FK coverage requirement).
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->unique(['user_id', 'provider']);
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), 'Duplicate key name')
                && ! str_contains($e->getMessage(), 'already exists')) {
                throw $e;
            }
        }

        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropUnique(['user_id', 'provider', 'instance_url', 'handle']);
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), "Can't DROP")
                && ! str_contains($e->getMessage(), 'no such index')) {
                throw $e;
            }
        }

        if (Schema::hasColumn('social_accounts', 'auth_failed_at')) {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropColumn('auth_failed_at');
            });
        }
    }
};
