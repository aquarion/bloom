<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\QueryException;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add feed_type column — idempotent: skip if it already exists
        try {
            if (! Schema::hasColumn('social_accounts', 'feed_type')) {
                Schema::table('social_accounts', function (Blueprint $table) {
                    $table->string('feed_type')->default('home')->after('provider');
                });
            }
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), 'Duplicate column name')
                && ! str_contains($e->getMessage(), 'already exists')) {
                throw $e;
            }
        }

        // Make access_token nullable (was non-nullable text)
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->text('access_token')->nullable()->change();
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), 'already')) {
                throw $e;
            }
        }

        // Make handle nullable (was non-nullable string)
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->string('handle')->nullable()->change();
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), 'already')) {
                throw $e;
            }
        }
    }

    public function down(): void
    {
        try {
            Schema::table('social_accounts', function (Blueprint $table) {
                $table->dropColumn('feed_type');
            });
        } catch (QueryException $e) {
            if (! str_contains($e->getMessage(), "Can't DROP")
                && ! str_contains($e->getMessage(), 'no such column')) {
                throw $e;
            }
        }

        Schema::table('social_accounts', function (Blueprint $table) {
            $table->text('access_token')->nullable(false)->change();
            $table->string('handle')->nullable(false)->change();
        });
    }
};
