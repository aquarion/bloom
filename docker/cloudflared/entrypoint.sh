#!/bin/bash
set -euo pipefail

# Detect if running in Docker
if [[ -f /.dockerenv ]] || [[ -n "${DOCKER:-}" ]]; then
    IN_DOCKER=true
    WORKDIR="/var/www/html"
    echo "[cloudflared] Running in Docker container"
else
    IN_DOCKER=false
    WORKDIR="."
    echo "[cloudflared] Running standalone"
fi

# The app is always reached over the internal compose network, where the
# `app` service listens on OCTANE_PORT regardless of the host-side port
# mapping (see config.yml, which hardcodes the same port for the same
# reason - cloudflared's config.yml isn't env-substituted).
APP_INTERNAL_PORT="${OCTANE_PORT:-8000}"

# If in Docker, wait for the main app to be ready
if [[ "$IN_DOCKER" == true ]]; then
    echo "[cloudflared] Waiting for application to be ready on http://app:${APP_INTERNAL_PORT}..."
    MAX_ATTEMPTS=60 # ~2 minutes at 2s intervals
    attempt=0
    until curl -sS -f "http://app:${APP_INTERNAL_PORT}" > /tmp/cloudflared-health.log 2>&1; do
        attempt=$((attempt + 1))
        if [[ "$attempt" -ge "$MAX_ATTEMPTS" ]]; then
            echo "[cloudflared] ERROR: application did not become ready after ${MAX_ATTEMPTS} attempts." >&2
            echo "[cloudflared] Last curl output:" >&2
            cat /tmp/cloudflared-health.log >&2
            echo "[cloudflared] Check 'docker compose logs app' for the root cause." >&2
            exit 1
        fi
        echo "[cloudflared] Waiting for app... (attempt ${attempt}/${MAX_ATTEMPTS})"
        sleep 2
    done
    echo "[cloudflared] App is ready!"
fi

# Named tunnel: hostnames -> origins are fixed in docker/cloudflared/config.yml
# (created via `cloudflared tunnel create` + `tunnel route dns`), so there's
# no URL discovery to do here, unlike ngrok/quick tunnels.
echo "[cloudflared] Starting named tunnel..."
exec cloudflared tunnel --config "${WORKDIR}/docker/cloudflared/config.yml" run
