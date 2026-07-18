<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'last_active_at')) {
                $table->timestamp('last_active_at')->nullable()->after('email');
            }

            if (! Schema::hasColumn('users', 'inactivity_warning_sent_at')) {
                $table->timestamp('inactivity_warning_sent_at')->nullable()->after('last_active_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['last_active_at', 'inactivity_warning_sent_at']);
        });
    }
};
