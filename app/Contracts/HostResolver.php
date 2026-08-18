<?php

namespace App\Contracts;

interface HostResolver
{
    /**
     * Resolve a hostname to every IPv4/IPv6 address it currently maps to.
     *
     * @return array<int, string> Empty when the host doesn't resolve.
     */
    public function resolve(string $host): array;
}
