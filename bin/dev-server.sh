#!/bin/bash

############################################################################
##### Development server script for Bloom
############################################################################

#############################################################################
##### Setup

set -o pipefail

STOPPING=0
NPM_PID=""
ARTISAN_PID=""
REDIS_STARTED=0

cleanup() {
    STOPPING=1
    echo "Stopping development server..."
    [ -n "$NPM_PID" ] && kill "$NPM_PID" 2>/dev/null
    [ -n "$ARTISAN_PID" ] && kill "$ARTISAN_PID" 2>/dev/null
    [ "$REDIS_STARTED" -eq 1 ] && docker stop bloom-redis >/dev/null 2>&1
    wait 2>/dev/null
    exit 0
}

trap cleanup INT TERM

############################################################################
##### Main script

echo "Starting development servers ..."

echo "Starting Redis server in Docker ..."
if docker ps --format '{{.Names}}' | grep -q '^bloom-redis$'; then
    echo "Container bloom-redis is already running."
elif docker ps -a --format '{{.Names}}' | grep -q '^bloom-redis$'; then
    echo "Container bloom-redis exists but is stopped, starting it..."
    if ! docker start bloom-redis; then
        echo "ERROR: Failed to start bloom-redis container."
        docker logs bloom-redis
        exit 1
    fi
else
    echo "Creating and starting container bloom-redis..."
    if ! docker run --name bloom-redis -p 6379:6379 -d redis; then
        echo "ERROR: Failed to create bloom-redis container. Is port 6379 already in use? Is Docker running?"
        exit 1
    fi
fi
REDIS_STARTED=1

echo "Waiting for Redis to start..."
I_COUNT=0
I_MAX=300
while ! docker exec bloom-redis redis-cli ping >/dev/null 2>&1; do
    sleep 1
    printf '.'
    I_COUNT=$((I_COUNT + 1))
    if [ "$I_COUNT" -ge "$I_MAX" ]; then
        echo ""
        echo "ERROR: Redis did not become ready after ${I_MAX} seconds. Container logs:"
        docker logs bloom-redis
        exit 1
    fi
    if [ "$(docker inspect -f '{{.State.Running}}' bloom-redis 2>/dev/null)" != "true" ]; then
        echo ""
        echo "Redis container has exited unexpectedly. Container logs:"
        docker logs bloom-redis
        exit 1
    fi
done
echo ""

echo "Starting Laravel development server ..."
php artisan serve &
ARTISAN_PID=$!

echo "Starting Vite development server ..."
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

############################################################################
##### Cleanup

[ -n "$ARTISAN_PID" ] && kill "$ARTISAN_PID" 2>/dev/null
[ "$REDIS_STARTED" -eq 1 ] && docker stop bloom-redis >/dev/null 2>&1
wait 2>/dev/null
