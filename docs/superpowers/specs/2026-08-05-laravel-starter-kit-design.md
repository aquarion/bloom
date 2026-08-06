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

#### 2a. Backend (PHP)

- `composer.json` requires `ext-opentelemetry` and `open-telemetry/opentelemetry-auto-laravel` — auto-instrumentation (traces, and Laravel log calls via its `LogWatcher`, which listens to the `MessageLogged` event fired by any `Log::*()` call regardless of channel), no custom provider code.
- `Dockerfile` installs the `opentelemetry` PHP extension (via `install-php-extensions`) and sets `ENV OTEL_RESOURCE_ATTRIBUTES="service.version=$APP_VERSION,deployment.environment=$APP_ENV,service.name=$APP_NAME,service.revision=$APP_PR_NUMBER,service.branch=$APP_BRANCH"`.
  - **Use `deployment.environment`, not `service.environment`.** Bloom's Dockerfile originally used `service.environment` here, which turned out to be a bug: when a kit-based app is actually deployed via `aquarion/autopelago`'s `firth_laravel_app` Ansible role, that role's `docker-compose.yml.j2` template sets its own `OTEL_RESOURCE_ATTRIBUTES` env var at container runtime (using `deployment.environment`), which overrides whatever the image bakes in via `ENV`. So the Dockerfile's baked value only matters for a manually-run/non-Ansible-deployed container — but should still match the real convention for consistency, and so local `docker run` testing reflects reality.
- No exporter endpoint/protocol is configured in-repo — `OTEL_EXPORTER_OTLP_*` vars are supplied externally by the deploy target, matching Bloom's current setup exactly.

#### 2b. Frontend (browser)

Implemented as `@istic-co/otel-browser-errors` (npm, `istic/otel-browser-errors` on GitHub) — a framework-agnostic package landed via aquarion/bloom#272, now proven in production in Bloom. The starter kit ships the wiring below; since the kit has no frontend framework opinion, the exact entry-point file differs per project (Bloom's is `resources/js/app.tsx`), but the pattern is the same for any Vite-based frontend.

- **Install:** `npm install @istic-co/otel-browser-errors` (use `^0.2.1` or later — `0.1.0`/`0.2.0` have a wrong resource-attribute key and drop spans on page reload, both fixed in `0.2.1`).
- **Init**, once at module scope in the frontend entry point, before the framework bootstraps:
  ```ts
  import { initOtelBrowserErrors } from '@istic-co/otel-browser-errors';

  initOtelBrowserErrors({
    endpoint: import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName: `${appName}-frontend`,
    serviceVersion: import.meta.env.VITE_APP_VERSION,
    environment: import.meta.env.VITE_APP_ENV,
    revision: import.meta.env.VITE_APP_PR_NUMBER,
    branch: import.meta.env.VITE_APP_BRANCH,
    getContext: () => ({ route: currentRoute, userId: currentUserId }), // whatever route/user tracking fits the framework in use
  });
  ```
  `endpoint` falsy (e.g. unset in local dev) makes this a safe no-op — no exporter, no listeners, no provider constructed.
- **Manual reporting** from wherever the frontend catches its own errors (e.g. a React error boundary's `componentDidCatch`, a Vue `errorCaptured` hook): `reportError(error, { extraContext: 'value' })`, exported from the same package.
- **Env vars** (add to `.env.example`, empty by default so local dev no-ops):
  - `VITE_OTEL_EXPORTER_OTLP_ENDPOINT=` (e.g. `https://otlp.svc.istic.systems/v1/traces` in deployed environments)
  - `VITE_APP_VERSION="${APP_VERSION}"`, `VITE_APP_ENV="${APP_ENV}"`, `VITE_APP_PR_NUMBER="${APP_PR_NUMBER}"`, `VITE_APP_BRANCH="${APP_BRANCH}"`
- **Dockerfile:** these are `VITE_`-prefixed, so Vite bakes them in at *build* time, not runtime — thread the existing `APP_VERSION`/`APP_ENV`/`APP_PR_NUMBER`/`APP_BRANCH` `ARG`s (already needed for the backend's `OTEL_RESOURCE_ATTRIBUTES`, see 2a) into the `npm run build` step: `VITE_APP_VERSION=$APP_VERSION VITE_APP_ENV=$APP_ENV VITE_APP_PR_NUMBER=$APP_PR_NUMBER VITE_APP_BRANCH=$APP_BRANCH npm run build`. Add a new `ARG VITE_OTEL_EXPORTER_OTLP_ENDPOINT=` (empty default) and thread it the same way — Bloom initially shipped without this and the whole frontend telemetry pipeline silently no-op'd in every deployed environment until it was added.
- **CI:** `ci.yml`'s `build-and-push` job needs `VITE_OTEL_EXPORTER_OTLP_ENDPOINT=<the real endpoint>` added to its Docker `build-args` — it's not a secret (ships in client JS regardless of how it's passed), a literal value in the workflow file is fine.
- **CORS (per-project, one-time):** the OTLP ingest endpoint (`otlp.svc.istic.systems`, see `aquarion/autopelago`'s `roles/firth_nginx/templates/nginx_confd/cors_otlp_ingest.conf`) only accepts POSTs from allow-listed origins. Set `browser_otel: true` on the app's entry in `autopelago`'s `host_vars/<host>/laravel_apps.yml` (staging inherits the flag from the parent app entry unless overridden) — without this, every browser error report fails silently (the package's `reportError` never throws, by design, so there's no console signal that CORS is rejecting requests).

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

- ~~Blocked on aquarion/bloom#272~~ — resolved. `@istic-co/otel-browser-errors` shipped, is live in Bloom, and is documented in full in section 2b above. No longer a blocker for this kit.
