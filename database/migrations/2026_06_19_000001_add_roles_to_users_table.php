<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('users', 'roles')) {
            return;
        }

        // MySQL forbids a literal DEFAULT on BLOB/TEXT/JSON columns (error 1101);
        // MariaDB allows it since it stores JSON as LONGTEXT. Stay nullable here
        // and rely on the model's 'array' cast for the empty-array default.
        Schema::table('users', function (Blueprint $table) {
            $table->json('roles')->nullable()->after('email');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('roles');
        });
    }
};
