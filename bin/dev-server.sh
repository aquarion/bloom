#!/bin/bash

set -e
set -o pipefail

ARTISAN_PID=
NPM_PID=

function kill_processes {
    echo "Stopping development server..."
    kill $ARTISAN_PID $NPM_PID
    exit 0
}

function launch_artisan {
    php artisan serve || {
        echo "Failed to start Laravel development server."
        exit 1
    }
    ARTISAN_PID=$!
}

function launch_npm {
    npm run dev || {
        echo "Failed to start Vite development server."
        exit 1
    }
    NPM_PID=$!
}

echo "Starting development server..."
launch_artisan &
launch_npm &

# Catch ctrl+c and kill both processes
trap kill_processes EXIT

wait $ARTISAN_PID $NPM_PID
