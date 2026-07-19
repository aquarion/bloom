<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * GDPR: tombstones no longer retain the raw email indefinitely. Add a
     * nullable `email_hash` column, backfill it from the existing `email`
     * column, then tighten it to non-nullable/unique and drop `email`.
     */
    public function up(): void
    {
        Schema::table('tombstones', function (Blueprint $table) {
            $table->string('email_hash', 40)->nullable()->after('email');
        });

        DB::table('tombstones')->orderBy('id')->chunkById(100, function ($tombstones) {
            foreach ($tombstones as $tombstone) {
                DB::table('tombstones')
                    ->where('id', $tombstone->id)
                    ->update(['email_hash' => sha1(strtolower($tombstone->email))]);
            }
        });

        Schema::table('tombstones', function (Blueprint $table) {
            $table->string('email_hash', 40)->nullable(false)->unique()->change();
        });

        Schema::table('tombstones', function (Blueprint $table) {
            $table->dropUnique('tombstones_email_unique');
            $table->dropColumn('email');
        });
    }

    /**
     * Reverse the migrations.
     *
     * The raw email cannot be recovered from the hash, so this restores a
     * nullable, empty `email` column rather than the original data.
     */
    public function down(): void
    {
        Schema::table('tombstones', function (Blueprint $table) {
            $table->string('email')->nullable()->after('id');
        });

        Schema::table('tombstones', function (Blueprint $table) {
            $table->dropColumn('email_hash');
        });
    }
};
