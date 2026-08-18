<?php

use App\Models\SocialAccount;
use App\Models\User;
use App\Policies\SocialAccountPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

it('allows update for the owning user', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->for($user)->create();

    expect((new SocialAccountPolicy)->update($user, $account))->toBeTrue();
});

it('denies update for a different user', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $account = SocialAccount::factory()->for($owner)->create();

    expect((new SocialAccountPolicy)->update($other, $account))->toBeFalse();
});

it('allows delete for the owning user', function () {
    $user = User::factory()->create();
    $account = SocialAccount::factory()->for($user)->create();

    expect((new SocialAccountPolicy)->delete($user, $account))->toBeTrue();
});

it('denies delete for a different user', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    $account = SocialAccount::factory()->for($owner)->create();

    expect((new SocialAccountPolicy)->delete($other, $account))->toBeFalse();
});
