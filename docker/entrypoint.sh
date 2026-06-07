#!/bin/sh
set -e

if [ -z "${APP_KEY}" ]; then
    echo "[entrypoint] ERROR: APP_KEY is not set. Generate one with 'php artisan key:generate' and set it in your environment." >&2
    exit 1
fi

echo "[entrypoint] Creating storage directories..."
mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs storage/app/public

echo "[entrypoint] Caching config..."
php artisan config:cache || {
    echo "[entrypoint] ERROR: php artisan config:cache failed" >&2
    exit 1
}

echo "[entrypoint] Caching views..."
php artisan view:cache || {
    echo "[entrypoint] ERROR: php artisan view:cache failed" >&2
    exit 1
}

# Set RUN_MIGRATIONS=false on additional replicas to avoid concurrent migration attempts.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "[entrypoint] Running migrations..."
    php artisan migrate --force || {
        echo "[entrypoint] ERROR: php artisan migrate --force failed" >&2
        exit 1
    }
fi

echo "[entrypoint] Starting Octane..."
exec php artisan octane:start --server="${OCTANE_SERVER:-frankenphp}" --host=0.0.0.0 --port="${OCTANE_PORT:-8000}"
