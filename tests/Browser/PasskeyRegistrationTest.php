<?php

use App\Models\User;
use Laravel\Dusk\Browser;

test('session is preserved between passkey options GET and register POST', function () {
    $user = User::factory()->create();

    $this->browse(function (Browser $browser) use ($user) {
        // Log in via the form with "remember me" so the browser gets a
        // remember_web_* cookie — this is what triggers the session rotation.
        $browser->visit('/login')
            ->type('email', $user->email)
            ->type('password', 'password')
            ->check('#remember')
            ->press('Log in')
            ->waitForLocation('/dashboard');

        // Now navigate to a passkey-accessible page so the session is warm.
        $browser->visit('/settings/profile')
            ->assertPathIs('/settings/profile');

        // Fire the GET options request and immediately POST to register.
        // We use fake credential data — the test doesn't care about WebAuthn
        // validity, only that the session challenge survives from GET to POST.
        //
        // If the session is lost between requests, the POST returns
        // "No active challenge. Please try again." (422).
        // If the session is preserved, the POST fails at credential
        // verification with "Passkey verification failed: ..." (422).
        $result = $browser->script(<<<'JS'
            return (async () => {
                const xsrf = decodeURIComponent(
                    document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''
                );

                const optionsRes = await fetch('/settings/passkeys/register/options', {
                    headers: { Accept: 'application/json' },
                });

                if (!optionsRes.ok) {
                    return { error: 'options_failed', status: optionsRes.status };
                }

                const postRes = await fetch('/settings/passkeys/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-XSRF-TOKEN': xsrf,
                    },
                    body: JSON.stringify({
                        name: 'Test passkey',
                        id: 'dGVzdA',
                        rawId: 'dGVzdA',
                        type: 'public-key',
                        response: {
                            attestationObject: 'dGVzdA',
                            clientDataJSON: 'dGVzdA',
                        },
                    }),
                });

                const body = await postRes.json();
                return { status: postRes.status, message: body.message ?? null };
            })();
        JS);

        $response = $result[0];

        expect($response)->not->toHaveKey('error', 'GET to /settings/passkeys/register/options failed')
            ->and($response['message'])->not->toBe(
                'No active challenge. Please try again.',
                'Session was not preserved between GET options and POST register — session rotated between requests',
            );
    });
});
