#!/bin/bash

set -o pipefail

STOPPING=0
NPM_PID=""
ARTISAN_PID=""

cleanup() {
    STOPPING=1
    echo "Stopping development server..."
    [ -n "$NPM_PID" ] && kill "$NPM_PID" 2>/dev/null
    [ -n "$ARTISAN_PID" ] && kill "$ARTISAN_PID" 2>/dev/null
    wait 2>/dev/null
    exit 0
}

trap cleanup INT TERM

echo "Starting development server..."

php artisan serve &
ARTISAN_PID=$!

while [ "$STOPPING" -eq 0 ]; do
    npm run dev &
    NPM_PID=$!
    wait "$NPM_PID"
    EXIT_CODE=$?

    [ "$STOPPING" -eq 1 ] && break

    if [ "$EXIT_CODE" -ne 0 ]; then
        echo "Vite crashed (exit $EXIT_CODE), restarting..."
        sleep 1
    else
        break
    fi
done

[ -n "$ARTISAN_PID" ] && kill "$ARTISAN_PID" 2>/dev/null
wait 2>/dev/null
