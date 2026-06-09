#!/bin/bash

############################################################################
##### Development server script for Bloom
############################################################################

set -e

if ! command -v overmind >/dev/null 2>&1; then
    echo "ERROR: overmind not found."
    echo "Install it from: https://github.com/DarthSim/overmind/releases"
    exit 1
fi

if ! command -v redis-server >/dev/null 2>&1; then
    echo "ERROR: redis-server not found. Install it with: sudo apt install redis-server"
    exit 1
fi

export OVERMIND_CAN_DIE=redis
exec overmind start
