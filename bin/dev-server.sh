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
REDIS_PID=""

cleanup() {
    STOPPING=1
    echo "Stopping development server..."
    [ -n "$NPM_PID" ] && kill "$NPM_PID" 2>/dev/null
    [ -n "$ARTISAN_PID" ] && kill "$ARTISAN_PID" 2>/dev/null
    [ -n "$REDIS_PID" ] && docker stop bloom-redis >/dev/null 2>&1
    wait 2>/dev/null
    exit 0
}

trap cleanup INT TERM

############################################################################
##### Main script

echo "Starting development servers ..."

echo "Starting Redis server in Docker ..."
# Check if a container named bloom-redis already exists, start it if it does, otherwise create and start a new one
if docker ps -a --format '{{.Names}}' | grep -q '^bloom-redis$'; then
    echo "Container bloom-redis already exists, starting it..."
    docker start bloom-redis
elif docker ps --format '{{.Names}}' | grep -q '^bloom-redis$'; then
    echo "Container bloom-redis is already running."
else
    echo "Creating and starting container bloom-redis..."
    docker run --name bloom-redis -p 6379:6379 -d redis
fi
REDIS_PID=$(docker inspect -f '{{.State.Pid}}' bloom-redis)

# Wait a moment for Redis to start

echo "Waiting for Redis to start..."
I_COUNT=0
I_MAX=300
while ! docker exec bloom-redis redis-cli ping >/dev/null 2>&1; do
    sleep 1
    echo -e ".\c"
    I_COUNT=$((I_COUNT + 1))
    if [ "$I_COUNT" -ge "$I_MAX" ]; then
        echo "Failed to start Redis after $I_MAX seconds."
        exit 1
    fi
    if [ -f /proc/"$REDIS_PID" ]; then
        continue
    else
        echo "Redis process has exited unexpectedly."
        docker logs bloom-redis
        docker stop bloom-redis
        exit 1
    fi
done


echo "Starting Laravel development server ..."
php artisan serve &
ARTISAN_PID=$!

while [ "$STOPPING" -eq 0 ]; do
    echo "Starting Vite development server ..."
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
[ -n "$REDIS_PID" ] && docker stop --rm bloom-redis >/dev/null 2>&1
wait 2>/dev/null
