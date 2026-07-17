<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tombstones', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->string('name');
            $table->unsignedInteger('schema_version')->default(1);
            $table->json('archived_passkeys');
            $table->json('archived_social_accounts');
            $table->unsignedBigInteger('original_user_id')->nullable();
            $table->timestamp('tombstoned_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tombstones');
    }
};
