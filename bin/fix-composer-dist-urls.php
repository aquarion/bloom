<?php

declare(strict_types=1);

/**
 * Rewrites composer.lock dist URLs that reference a commit SHA from
 * api.github.com to codeload.github.com.
 *
 * Packagist publishes GitHub-hosted package archives as
 * "https://api.github.com/repos/{owner}/{repo}/zipball/{ref}", which 302s to
 * "https://codeload.github.com/{owner}/{repo}/legacy.zip/{ref}" for the
 * actual bytes. The api.github.com hop is subject to GitHub's low anonymous
 * REST rate limit and, on a 403, Composer falls back to an interactive auth
 * prompt that aborts non-interactive installs (e.g. Claude Code Cloud, which
 * has no GitHub API credentials for arbitrary third-party repos). Pointing
 * dist.url directly at the codeload redirect target serves byte-identical
 * content without that hop: codeload.github.com isn't in Composer's default
 * github-domains list, so it's treated as a plain anonymous HTTP download.
 *
 * This also fixes phpstan/phpstan, which has no "source" (git) entry at all
 * in Packagist metadata, only dist - so "preferred-install: source" can't
 * help it, but this rewrite makes its dist download work anonymously too.
 */
$lockPath = __DIR__.'/../composer.lock';
$contents = file_get_contents($lockPath);

if ($contents === false) {
    fwrite(STDERR, "Could not read {$lockPath}\n");

    exit(1);
}

// Decoded as objects (not associative arrays): json_decode(..., true) maps
// both empty JSON objects ("{}") and empty JSON arrays ("[]") to an empty PHP
// array, so re-encoding loses the distinction and corrupts fields like
// "stability-flags": {} into "stability-flags": []. Object mode keeps empty
// objects as stdClass, which always re-encodes as "{}".
$lock = json_decode($contents, false, 512, JSON_THROW_ON_ERROR);

$pattern = '#^https://api\.github\.com/repos/([^/]+)/([^/]+)/zipball/([0-9a-f]+)$#';

$rewriteUrl = static function (string $url) use ($pattern): ?string {
    if (preg_match($pattern, $url, $matches) !== 1) {
        return null;
    }

    [, $owner, $repo, $ref] = $matches;

    return "https://codeload.github.com/{$owner}/{$repo}/legacy.zip/{$ref}";
};

$count = 0;

foreach (['packages', 'packages-dev'] as $section) {
    foreach ($lock->{$section} ?? [] as $package) {
        $url = $package->dist->url ?? null;

        if ($url === null) {
            continue;
        }

        $rewritten = $rewriteUrl($url);

        if ($rewritten === null) {
            continue;
        }

        $package->dist->url = $rewritten;
        $count++;
    }
}

if ($count === 0) {
    echo "No api.github.com dist URLs found in composer.lock; nothing to rewrite.\n";

    exit(0);
}

$encoded = json_encode(
    $lock,
    JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
);

// Write to a temp file and rename over the target rather than writing
// $lockPath directly: rename() is atomic on POSIX filesystems, so a failed
// or interrupted write can never leave composer.lock truncated.
$tmpPath = $lockPath.'.tmp';

if (file_put_contents($tmpPath, $encoded."\n") === false) {
    fwrite(STDERR, "Could not write {$tmpPath}\n");

    exit(1);
}

if (rename($tmpPath, $lockPath) === false) {
    fwrite(STDERR, "Could not move {$tmpPath} to {$lockPath}\n");

    exit(1);
}

echo "Rewrote {$count} dist URL(s) in composer.lock to use codeload.github.com.\n";
