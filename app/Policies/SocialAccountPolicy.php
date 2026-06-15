<?php

namespace App\Policies;

use App\Models\SocialAccount;
use App\Models\User;

class SocialAccountPolicy
{
    public function update(User $user, SocialAccount $account): bool
    {
        return $user->id === $account->user_id;
    }
}
