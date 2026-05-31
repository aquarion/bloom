#!/bin/bash

set -o pipefail

cleanup() {
    echo "Stopping development server..."
    kill "$ARTISAN_PID" "$NPM_PID" 2>/dev/null
    wait "$ARTISAN_PID" "$NPM_PID" 2>/dev/null
}

echo "Starting development server..."

php artisan serve &
ARTISAN_PID=$!

npm run dev &
NPM_PID=$!

trap cleanup INT TERM EXIT

wait "$ARTISAN_PID" "$NPM_PID"
