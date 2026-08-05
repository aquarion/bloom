# Laravel Starter Kit — Design Spec

Date: 2026-08-05
Status: Approved (pre-implementation)

## Problem

Every new Laravel project (Bloom, alchemistic, others) re-implements the same handful of ops/infra patterns from scratch: version exposure for deploys, OTEL instrumentation, a local Cloudflare tunnel for dev, Pest test config, and a CI/CD + Dependabot pipeline. These patterns already exist independently in Bloom and alchemistic but drift apart over time and have to be rediscovered per project. This spec defines a standalone starter kit that bundles them once so new projects start with all of it in place.

## Goals

- One `composer create-project` command produces a fresh Laravel 13 app with these ops patterns already wired in.
- Infra/ops scope only — no frontend framework opinions (no Inertia/React baked in), so the kit stays useful regardless of what frontend stack a given project needs.
- Each piece should match an existing, proven pattern (from Bloom or alchemistic) rather than invent something new, except where explicitly noted.

## Non-goals

- No interactive installer/setup wizard. Placeholder values (app name, tunnel ID, GHCR image name, deploy secrets) are documented in the README and filled in by hand.
- No frontend stack (Inertia, React, Tailwind) — deliberately left out of this kit's scope.
- No new Argo Tunnel production pattern — production deploy stays SSH/GHCR-based, matching Bloom; the tunnel is dev-only.
- Server/host provisioning is out of scope — that's owned by `aquarion/autopelago` (Ansible), which must run once per new host before the CI/CD deploy jobs in this kit can SSH in and run containers.

## Repo & distribution

- New repo: `istic/laravel-starter-kit`, structured as a normal Laravel 13 app skeleton (like `laravel/laravel`) with the pieces below pre-wired.
- Consumed via `composer create-project istic/laravel-starter-kit <app-name>`.

## Components

### 1. App version exposure

- `config/version.php`: reads `APP_VERSION`, `APP_PR_NUMBER`, `APP_BRANCH` env vars, falls back to reading `.git/HEAD` when unset. Ported from Bloom's `config/version.php`.
- `Dockerfile`: declares `ARG APP_VERSION=dev`, `ARG APP_PR_NUMBER`, `ARG APP_BRANCH`, sets them as `ENV`, and stamps OCI image labels (`org.opencontainers.image.version/revision/ref.name`).
- Since the kit has no frontend framework opinion, version isn't shared via Inertia middleware (as Bloom does it). Instead a small health/version endpoint (e.g. `GET /up` extended, or a dedicated `/version` route) returns `config('version.*')` as JSON, so any frontend can consume it.
- CI (`ci.yml`) passes `APP_VERSION`/`APP_PR_NUMBER`/`APP_BRANCH` as Docker build-args from the git ref/tag being built.

### 2. OpenTelemetry

- `composer.json` requires `ext-opentelemetry` and `open-telemetry/opentelemetry-auto-laravel` — auto-instrumentation, no custom provider code.
- `Dockerfile` installs the `opentelemetry` PHP extension (via `install-php-extensions`) and sets `ENV OTEL_RESOURCE_ATTRIBUTES="service.version=$APP_VERSION,service.environment=$APP_ENV,service.name=$APP_NAME,service.revision=$APP_PR_NUMBER,service.branch=$APP_BRANCH"`.
- No exporter endpoint/protocol is configured in-repo — `OTEL_EXPORTER_OTLP_*` vars are supplied externally by the deploy target, matching Bloom's current setup exactly.

### 3. Argo Tunnel (local dev only)

Ported from `istic/alchemistic`'s `docker/cloudflared/` setup (that repo notes production uses a separate `docker/production` image deployed via the `laravel_apps` Ansible role in `aquarion/autopelago` — the tunnel is dev-only there too).

- `docker/cloudflared/Dockerfile`: `FROM cloudflare/cloudflared:latest` binary copied onto `alpine:3.20` with `bash curl grep sed coreutils`.
- `docker/cloudflared/entrypoint.sh`: detects Docker vs standalone, loads `.env` for `APP_PORT`, waits for the `application` service to become healthy, then runs `cloudflared tunnel --config docker/cloudflared/config.yml run`.
- `docker/cloudflared/config.yml`: shipped as a placeholder template —
  ```yaml
  tunnel: <TUNNEL_UUID>
  credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

  ingress:
    - hostname: <app>.istic.dev
      service: http://application:80
    - hostname: vite-<app>.istic.dev
      service: http://application:5173
    - service: http_status:404
  ```
- `compose.yaml` gets a `cloudflared` service block (builds from `docker/cloudflared`, mounts `./docker/cloudflared/data:/root/.cloudflared`, depends on `application`), matching alchemistic's wiring.
- README documents the one-time per-project setup: `cloudflared tunnel create <app>`, `cloudflared tunnel route dns <app> <app>.istic.dev`, then filling in the real UUID/hostnames in `config.yml`.
- Production is unaffected by any of this — no tunnel in the production Dockerfile/deploy path.

### 4. Test preferences (Pest)

- `phpunit.xml`: `Unit`/`Feature` testsuites, `<source>` coverage include of `app/`, test-env overrides (sqlite `:memory:` DB, array cache/session, sync queue, any optional packages like Pulse/Telescope disabled in tests).
- `tests/Pest.php`: binds `Tests\TestCase` (+ `RefreshDatabase`) to `Feature`, `Tests\DuskTestCase` to `Browser`.
- `tests/TestCase.php`: plain abstract base class, no custom helpers beyond what's needed.
- `composer.json` scripts: `pint --parallel` (lint) and `pest --parallel` (test), matching Bloom's linting convention extended to tests.

### 5. CI/CD

- `.github/workflows/ci.yml`: build/test job (PHP + Node setup, install deps, migrate, build assets, Pest) → `build-and-push` job (Docker Buildx build/push to GHCR with version build-args) → `deploy-staging`/`deploy-production` jobs via `appleboy/ssh-action`, SSHing into hosts already provisioned by `aquarion/autopelago`. Parameterized so a new project only needs to set its own SSH host/key secrets and GHCR image name.
- `.github/workflows/release.yml`: reusable workflow — computes next semver tag from git tags, creates a GitHub Release, can be called by other workflows with `secrets: inherit`.
- `.github/workflows/dependabot-auto-merge.yml`: triggers on PRs against the `dependabot-updates` branch, calls `istic/shared-workflows/.github/workflows/auto-merge-dependabot.yml@main`.
- `.github/workflows/auto-rebase-dependabot.yml`: daily cron, calls `istic/shared-workflows/.github/workflows/auto-rebase-dependabot.yml@main` to keep `dependabot-updates` rebased onto `main`.
- `.github/workflows/dependabot-make-release.yml`: weekly cron (+ manual dispatch with a version-bump choice) — merges `dependabot-updates` into `main` if it's ahead, then calls `release.yml` to cut a release.
- `.github/dependabot.yml`: composer/npm/github-actions/docker ecosystems, all with `target-branch: dependabot-updates`.

## Setup flow for a new project

No installer command. After `composer create-project istic/laravel-starter-kit <app>`, the README lists every placeholder to fill in by hand:

- App name / `APP_NAME` env var (feeds into `OTEL_RESOURCE_ATTRIBUTES` and image labels).
- `docker/cloudflared/config.yml` — real tunnel UUID, credentials file, and hostnames (after running `cloudflared tunnel create`).
- GHCR image name in `ci.yml`.
- SSH deploy secrets (`SSH_HOST`, `SSH_KEY`, etc.) in repo settings, for hosts already provisioned via `aquarion/autopelago`.
- Confirm `aquarion/autopelago` has provisioned the target staging/production host before the deploy jobs will succeed.

## Testing the starter kit itself

- `composer create-project istic/laravel-starter-kit /tmp/test-app` locally; confirm the app boots and `php artisan test` passes.
- `docker compose up` brings up `application` + `cloudflared` (+ any other services) without errors; tunnel *connectivity* can't be fully verified without real Cloudflare credentials, so that step is manual/documented rather than automated.
- CI workflows validated by dry-run / `act` where feasible, otherwise by exercising them against the real `istic/laravel-starter-kit` repo once created (a push to a throwaway branch should trigger `ci.yml`'s build/test job).

## Open questions / follow-ups

- None outstanding — all decisions above were confirmed during brainstorming (2026-08-05).
