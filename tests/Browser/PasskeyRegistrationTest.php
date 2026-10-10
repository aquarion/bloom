<?php

use App\Models\User;

test('registration challenge survives from passkey options GET to register POST', function () {
    // A user with no passkey yet is enrolling, so the POST skips the step-up check
    // and goes straight to the stored challenge — the path under test.
    $user = User::factory()->create();

    $this->actingAs($user);

    $page = visit('/register/passkey')
        ->assertPathIs('/register/passkey');

    // Fire the GET options request and immediately POST to register. The credential
    // data is fake — the test only cares that the challenge stored by the GET is
    // still there for the POST.
    //
    // If the challenge is lost between requests, the POST returns
    // "No active challenge. Please try again." (422).
    // If it survives, the POST fails at credential verification instead.
    $response = $page->script(<<<'JS'
        async () => {
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
        }
    JS);

    expect($response)->not->toHaveKey('error')
        ->and($response['status'])->toBe(422)
        ->and($response['message'])->toBe(
            'Passkey verification failed. Please try again.',
            'The registration challenge from GET options was not available to POST register',
        );
});
