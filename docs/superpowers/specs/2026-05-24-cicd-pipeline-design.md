# CI/CD Pipeline Design

**Date:** 2026-05-24
**Reference:** istic/novelathon CI/CD pattern

## Overview

Add a full CI/CD pipeline to sprouter: test gate, Docker image build+push to GHCR, staging deploy on PR, production deploy on tagged release. Mirrors novelathon's workflow structure.

## Workflow Files

| File | Action |
|---|---|
| `.github/workflows/lint.yml` | Keep as-is — fast feedback, not a deploy gate |
| `.github/workflows/tests.yml` | **Remove** — absorbed into `ci.yml` |
| `.github/workflows/ci.yml` | **New** — test → build → deploy |
| `.github/workflows/release.yml` | **New** — semver bump → tag → calls ci.yml |

## `ci.yml` — Job Structure

Triggers: all PRs, push to `v*` tags, `workflow_dispatch`, `workflow_call` (from release.yml).

### Jobs

```
test → build-and-push → deploy-staging   (PR only)
                      → deploy-production (tag or workflow_call only)
```

**test**
- Runs on `ubuntu-latest`
- PHP 8.4 only (no matrix — keeps gate fast)
- Steps: checkout, setup-php, setup-node, `composer install`, `npm ci`, copy `.env.example`, `php artisan key:generate`, `php artisan migrate --force`, `npm run build`, `./vendor/bin/pest`

**build-and-push**
- Depends on `test`
- Guard: skip on fork PRs (`github.event.pull_request.head.repo.full_name == github.repository`)
- Permissions: `contents: read`, `packages: write`
- Registry: `ghcr.io`, image: `ghcr.io/aquarion/sprouter`
- Tags:
  - `type=semver,pattern={{version}}` (on tag)
  - `type=semver,pattern={{major}}.{{minor}}` (on tag)
  - `type=sha`
  - `latest` when tag present or on `refs/tags/v*`
  - `staging` on PRs
- Dockerfile: repo root `Dockerfile` (no `file:` override needed)
- Build args: `APP_VERSION`, `APP_PR_NUMBER`, `APP_BRANCH`
- Cache: `type=gha`

**deploy-staging**
- Depends on `build-and-push`
- Condition: `github.event_name == 'pull_request'`
- SSH: `host: firth.water.gkhs.net`, `username: sprouter`, `key: ${{ secrets.FIRTH_SSH_KEY }}`
- Script:
  ```bash
  set -e
  cd /home/docker/sprouter-staging
  docker compose pull
  docker compose up -d
  # wait for app ready (30 x 2s)
  docker compose exec -T app php artisan migrate --force
  ```

**deploy-production**
- Depends on `build-and-push`
- Condition: `inputs.tag != ''` or `startsWith(github.ref, 'refs/tags/v')` on push/dispatch
- SSH: same host/user/key
- Script: same as staging but `cd /home/docker/sprouter`

## `release.yml` — Release Workflow

Triggers: `workflow_dispatch` (with `version_bump` input: patch/minor/major), `workflow_call`.

### Jobs

**tag**
- Permissions: `contents: write`
- Steps:
  1. Checkout with `fetch-depth: 0`, ref `main`
  2. Find latest `v*.*.*` tag (default `v0.0.0`)
  3. Calculate next version from bump type
  4. `git tag -a $NEXT_VERSION && git push origin $NEXT_VERSION`
  5. Generate release notes (commits since last tag + Docker pull snippet)
  6. Create GitHub Release via `softprops/action-gh-release@v3`
- Output: `next_version`

**ci**
- Depends on `tag`
- Calls `./.github/workflows/ci.yml` with `tag: ${{ needs.tag.outputs.next_version }}`
- `secrets: inherit`
- Permissions: `contents: read`, `packages: write`

## Secrets Required

| Secret | Purpose |
|---|---|
| `FIRTH_SSH_KEY` | Private key for SSH deploy to firth |
| `GITHUB_TOKEN` | Auto-provided — GHCR push |

## Server Details

| Environment | Host | User | Working Dir |
|---|---|---|---|
| Staging | firth.water.gkhs.net | sprouter | `/home/docker/sprouter-staging` |
| Production | firth.water.gkhs.net | sprouter | `/home/docker/sprouter` |

## Out of Scope

- Dependabot config (can be added later)
- Auto-merge dependabot PRs
- Pre-commit lint actions
