<?php

use App\Rules\SafeInstanceUrl;
use Tests\TestCase;

uses(TestCase::class);

function safeInstanceUrlFailures(string $url): array
{
    $failures = [];
    (new SafeInstanceUrl)->validate('instance_url', $url, function (string $message) use (&$failures) {
        $failures[] = $message;
    });

    return $failures;
}

it('passes a plain https URL', function () {
    expect(safeInstanceUrlFailures('https://mastodon.social'))->toBe([]);
});

it('rejects a non-https URL', function () {
    expect(safeInstanceUrlFailures('http://mastodon.social'))->not->toBeEmpty();
});

it('rejects a bare private IP host', function () {
    foreach (['https://127.0.0.1', 'https://192.168.1.1', 'https://10.0.0.1', 'https://169.254.169.254'] as $url) {
        expect(safeInstanceUrlFailures($url))->not->toBeEmpty();
    }
});

it('allows a bare public IP host', function () {
    expect(safeInstanceUrlFailures('https://8.8.8.8'))->toBe([]);
});

it('rejects a malformed URL', function () {
    expect(safeInstanceUrlFailures('not-a-url'))->not->toBeEmpty();
});
