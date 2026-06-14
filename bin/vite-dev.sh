#!/bin/bash
# Runs `npm run dev` and restarts it if public/hot vanishes while vite is alive.

HOT_FILE="public/hot"
STARTUP_TIMEOUT=30
POLL_INTERVAL=5

while true; do
    npm run dev &
    VITE_PID=$!

    # Wait for the hot file to appear before monitoring it.
    elapsed=0
    while [ ! -f "$HOT_FILE" ] && kill -0 "$VITE_PID" 2>/dev/null; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$STARTUP_TIMEOUT" ]; then
            echo "[vite-watchdog] hot file never appeared after ${STARTUP_TIMEOUT}s, restarting..."
            kill "$VITE_PID" 2>/dev/null
            break
        fi
    done

    # Monitor: restart if the hot file disappears while vite is still running.
    while kill -0 "$VITE_PID" 2>/dev/null; do
        sleep "$POLL_INTERVAL"
        if [ ! -f "$HOT_FILE" ] && kill -0 "$VITE_PID" 2>/dev/null; then
            echo "[vite-watchdog] hot file gone, restarting vite..."
            kill "$VITE_PID" 2>/dev/null
            break
        fi
    done

    wait "$VITE_PID" 2>/dev/null
    sleep 1
done
