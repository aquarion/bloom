<?php

namespace Tests\Support;

use App\Contracts\HostResolver;

/**
 * Swapped in for the container-bound HostResolver in tests, since real DNS resolution
 * isn't available in the test sandbox. Bind an instance via $this->app->instance() (or
 * Pest's global beforeEach in tests/Pest.php) rather than resolving the real DnsHostResolver.
 */
class FakeHostResolver implements HostResolver
{
    /**
     * @param  array<int, string>  $addresses  Returned for every host, regardless of what's asked for.
     */
    public function __construct(private array $addresses) {}

    public function resolve(string $host): array
    {
        return $this->addresses;
    }
}
