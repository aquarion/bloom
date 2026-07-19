<?php

use App\Mail\AccountTombstoned;

test('mailable has the expected subject and renders the name', function () {
    $mailable = new AccountTombstoned('Ada Lovelace');

    expect($mailable->envelope()->subject)->toBe('Your account has been archived due to inactivity');
    expect($mailable->render())->toContain('Ada Lovelace');
});
