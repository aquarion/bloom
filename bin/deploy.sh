#!/bin/bash
set -euo pipefail

php artisan down --retry=10

git pull --ff-only

composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader

npm ci && npm run build

php artisan migrate --force

php artisan optimize

php artisan up
