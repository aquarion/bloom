<?php

use App\Mail\InactivityWarning;
use App\Models\User;

test('mailable has the expected subject and renders the user name', function () {
    $user = new User(['name' => 'Ada Lovelace', 'email' => 'ada@example.com']);

    $mailable = new InactivityWarning($user);

    expect($mailable->envelope()->subject)->toBe('Your account will be archived soon due to inactivity');
    expect($mailable->render())->toContain('Ada Lovelace');
});
