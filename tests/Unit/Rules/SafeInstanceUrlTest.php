<?php

use App\Rules\SafeInstanceUrl;
use Tests\TestCase;

uses(TestCase::class);

afterEach(function () {
    SafeInstanceUrl::$resolver = null;
});

function safeInstanceUrlFailures(string $url): array
{
    $failures = [];
    (new SafeInstanceUrl)->validate('instance_url', $url, function (string $message) use (&$failures) {
        $failures[] = $message;
    });

    return $failures;
}

it('passes a plain https URL that resolves to a public IP', function () {
    SafeInstanceUrl::$resolver = fn (string $host) => '203.0.113.10';

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

it('rejects a hostname that resolves to a private IP', function () {
    SafeInstanceUrl::$resolver = fn (string $host) => '10.0.0.5';

    expect(safeInstanceUrlFailures('https://internal.example'))->not->toBeEmpty();
});

it('rejects a hostname that resolves to the cloud metadata IP', function () {
    SafeInstanceUrl::$resolver = fn (string $host) => '169.254.169.254';

    expect(safeInstanceUrlFailures('https://attacker.example'))->not->toBeEmpty();
});

it('rejects a hostname that fails to resolve', function () {
    // gethostbyname() returns the input host unchanged when resolution fails.
    SafeInstanceUrl::$resolver = fn (string $host) => $host;

    expect(safeInstanceUrlFailures('https://does-not-exist.invalid'))->not->toBeEmpty();
});
