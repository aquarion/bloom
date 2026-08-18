<?php

use App\Contracts\HostResolver;
use App\Rules\SafeInstanceUrl;
use Tests\Support\FakeHostResolver;
use Tests\TestCase;

uses(TestCase::class);

/**
 * @param  array<int, string>  $addresses
 */
function fakeResolverReturning(array $addresses): void
{
    test()->app->instance(HostResolver::class, new FakeHostResolver($addresses));
}

function safeInstanceUrlFailures(string $url): array
{
    $failures = [];
    (new SafeInstanceUrl)->validate('instance_url', $url, function (string $message) use (&$failures) {
        $failures[] = $message;
    });

    return $failures;
}

it('passes a plain https URL that resolves to a public IP', function () {
    fakeResolverReturning(['203.0.113.10']);

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
    fakeResolverReturning(['10.0.0.5']);

    expect(safeInstanceUrlFailures('https://internal.example'))->not->toBeEmpty();
});

it('rejects a hostname that resolves to the cloud metadata IP', function () {
    fakeResolverReturning(['169.254.169.254']);

    expect(safeInstanceUrlFailures('https://attacker.example'))->not->toBeEmpty();
});

it('rejects a hostname that fails to resolve', function () {
    fakeResolverReturning([]);

    expect(safeInstanceUrlFailures('https://does-not-exist.invalid'))->not->toBeEmpty();
});

it('rejects a hostname where only one of several resolved addresses is private', function () {
    // A dual-stack (or multi-A-record) host only needs one unvalidated address for an
    // HTTP client to prefer it — every returned address must be checked, not just the first.
    fakeResolverReturning(['203.0.113.10', '169.254.169.254']);

    expect(safeInstanceUrlFailures('https://dual-stack.example'))->not->toBeEmpty();
});

it('allows a hostname where every resolved address is public', function () {
    fakeResolverReturning(['203.0.113.10', '2001:db8::1']);

    expect(safeInstanceUrlFailures('https://dual-stack.example'))->toBe([]);
});
