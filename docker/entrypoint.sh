#!/bin/sh
set -e

mkdir -p storage/framework/{cache,sessions,views} storage/logs storage/app/public

php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan migrate --force

exec php artisan octane:start --server=frankenphp --host=0.0.0.0 --port="${OCTANE_PORT:-8000}"
