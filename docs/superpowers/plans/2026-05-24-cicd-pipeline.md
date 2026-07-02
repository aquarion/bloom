# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full CI/CD pipeline — test gate, Docker image build+push to GHCR, staging deploy on PR, production deploy on tagged release.

**Architecture:** Three GitHub Actions workflows: an existing `lint.yml` kept as-is, a new `ci.yml` that runs tests then builds/pushes a Docker image and deploys to staging (on PR) or production (on tag), and a new `release.yml` that bumps the semver tag and triggers `ci.yml`. The existing `tests.yml` is deleted — its logic moves into the `test` job in `ci.yml`.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR (`ghcr.io`), FrankenPHP (existing Dockerfile), `appleboy/ssh-action` for SSH deploy, `softprops/action-gh-release` for GitHub Releases.

---

## File Map

| Action | Path |
|---|---|
| **Delete** | `.github/workflows/tests.yml` |
| **Create** | `.github/workflows/ci.yml` |
| **Create** | `.github/workflows/release.yml` |

---

### Task 1: Create feature branch

- [ ] **Step 1: Verify current branch and create feature branch**

```bash
git branch --show-current
git checkout -b claude/cicd-pipeline
```

Expected: prompt changes to `claude/cicd-pipeline`.

---

### Task 2: Create `ci.yml`

**Files:**
- Create: `.github/workflows/ci.yml`
- Delete: `.github/workflows/tests.yml`

This workflow has four jobs: `test` → `build-and-push` → `deploy-staging` (PR only) / `deploy-production` (tag only).

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    tags:
      - "v*"
  pull_request:
    branches: ["**"]
    types: [opened, synchronize, reopened]
  workflow_dispatch:
  workflow_call:
    inputs:
      tag:
        description: "Release tag to build and deploy"
        type: string
        required: true

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: "8.4"
          tools: composer:v2

      - name: Setup Node
        uses: actions/setup-node@v6
        with:
          node-version: "26"

      - name: Install Node dependencies
        run: npm ci

      - name: Install PHP dependencies
        run: composer install --no-interaction --prefer-dist --optimize-autoloader

      - name: Copy environment file
        run: cp .env.example .env

      - name: Generate application key
        run: php artisan key:generate

      - name: Run migrations
        run: php artisan migrate --force

      - name: Build assets
        run: npm run build

      - name: Run tests
        run: ./vendor/bin/pest

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          ref: ${{ inputs.tag || github.ref }}

      - name: Log in to GitHub Container Registry
        uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}},value=${{ inputs.tag || github.ref_name }}
            type=semver,pattern={{major}}.{{minor}},value=${{ inputs.tag || github.ref_name }}
            type=sha
            type=raw,value=latest,enable=${{ inputs.tag != '' || startsWith(github.ref, 'refs/tags/v') }}
            type=raw,value=staging,enable=${{ github.event_name == 'pull_request' }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            APP_VERSION=${{ inputs.tag || github.ref_name }}
            APP_PR_NUMBER=${{ github.event.pull_request.number }}
            APP_BRANCH=${{ github.head_ref }}

  deploy-staging:
    needs: build-and-push
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Deploy staging
        uses: appleboy/ssh-action@v1
        with:
          host: firth.water.gkhs.net
          username: sprouter
          key: ${{ secrets.FIRTH_SSH_KEY }}
          script: |
            set -e
            cd /home/docker/sprouter-staging
            docker compose pull
            docker compose up -d
            for i in $(seq 1 30); do
              docker compose exec -T app php artisan --version > /dev/null 2>&1 && break
              [ "$i" -eq 30 ] && echo "Container failed to become ready" && exit 1
              sleep 2
            done
            docker compose exec -T app php artisan migrate --force

  deploy-production:
    needs: build-and-push
    if: inputs.tag != '' || ((github.event_name == 'push' || github.event_name == 'workflow_dispatch') && startsWith(github.ref, 'refs/tags/v'))
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - name: Deploy production
        uses: appleboy/ssh-action@v1
        with:
          host: firth.water.gkhs.net
          username: sprouter
          key: ${{ secrets.FIRTH_SSH_KEY }}
          script: |
            set -e
            cd /home/docker/sprouter
            docker compose pull
            docker compose up -d
            for i in $(seq 1 30); do
              docker compose exec -T app php artisan --version > /dev/null 2>&1 && break
              [ "$i" -eq 30 ] && echo "Container failed to become ready" && exit 1
              sleep 2
            done
            docker compose exec -T app php artisan migrate --force
```

- [ ] **Step 2: Delete the old tests.yml**

```bash
rm .github/workflows/tests.yml
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/tests.yml
git commit -m "⚙️ Add CI workflow: test gate, GHCR build/push, staging and production deploy"
```

The pre-commit hook `Lint GitHub Actions workflow files` will validate the YAML. If it fails, check indentation — all `steps:` items must be indented 6 spaces (2 under `steps:`).

---

### Task 3: Create `release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

This workflow accepts a `version_bump` input (patch/minor/major), calculates the next semver tag, creates a GitHub Release, and calls `ci.yml` to build and deploy.

- [ ] **Step 1: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version_bump:
        description: "Version bump type"
        required: true
        type: choice
        options:
          - patch
          - minor
          - major
  workflow_call:
    inputs:
      version_bump:
        type: string
        description: "Version bump type"
        required: true

jobs:
  tag:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      next_version: ${{ steps.next_version.outputs.next_version }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v6
        with:
          fetch-depth: 0
          ref: main

      - name: Get latest tag
        id: get_tag
        run: |
          LATEST_TAG=$(git tag -l "v*.*.*" | sort -V | tail -n 1)
          if [ -z "$LATEST_TAG" ]; then
            LATEST_TAG="v0.0.0"
            echo "No existing tags found, starting from $LATEST_TAG"
          else
            echo "Latest tag: $LATEST_TAG"
          fi
          echo "latest_tag=$LATEST_TAG" >> "$GITHUB_OUTPUT"

      - name: Calculate next version
        id: next_version
        run: |
          LATEST_TAG="${{ steps.get_tag.outputs.latest_tag }}"
          VERSION=${LATEST_TAG#v}

          IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"

          case "${{ inputs.version_bump }}" in
            major)
              MAJOR=$((MAJOR + 1))
              MINOR=0
              PATCH=0
              ;;
            minor)
              MINOR=$((MINOR + 1))
              PATCH=0
              ;;
            patch)
              PATCH=$((PATCH + 1))
              ;;
          esac

          NEXT_VERSION="v${MAJOR}.${MINOR}.${PATCH}"
          echo "Next version: $NEXT_VERSION"
          echo "next_version=$NEXT_VERSION" >> "$GITHUB_OUTPUT"

      - name: Create and push tag
        env:
          NEXT_VERSION: ${{ steps.next_version.outputs.next_version }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          git tag -a "$NEXT_VERSION" -m "Release $NEXT_VERSION"
          git push origin "$NEXT_VERSION"

          echo "✅ Created and pushed tag: $NEXT_VERSION"

      - name: Generate release notes
        id: release_notes
        run: |
          LATEST_TAG="${{ steps.get_tag.outputs.latest_tag }}"
          NEXT_VERSION="${{ steps.next_version.outputs.next_version }}"

          if [ "$LATEST_TAG" == "v0.0.0" ]; then
            COMMITS=$(git log --pretty=format:"- %s (%h)" --no-merges)
          else
            COMMITS=$(git log ${LATEST_TAG}..HEAD --pretty=format:"- %s (%h)" --no-merges)
          fi

          cat > release_notes.md << EOF
          ## What's Changed

          ${COMMITS}

          ## Docker Image

          \`\`\`bash
          docker pull ghcr.io/${{ github.repository }}:${NEXT_VERSION#v}
          docker pull ghcr.io/${{ github.repository }}:latest
          \`\`\`

          **Full Changelog**: https://github.com/${{ github.repository }}/compare/${LATEST_TAG}...${NEXT_VERSION}
          EOF

          echo "Release notes generated"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v3
        with:
          tag_name: ${{ steps.next_version.outputs.next_version }}
          name: Release ${{ steps.next_version.outputs.next_version }}
          body_path: release_notes.md
          draft: false
          prerelease: false
          generate_release_notes: true

  ci:
    needs: tag
    uses: ./.github/workflows/ci.yml
    with:
      tag: ${{ needs.tag.outputs.next_version }}
    secrets: inherit  # pragma: allowlist secret
    permissions:
      contents: read
      packages: write
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "⚙️ Add release workflow: semver bump, GitHub Release, triggers CI"
```

---

### Task 4: Open draft PR

- [ ] **Step 1: Push branch and open draft PR**

```bash
git push -u origin claude/cicd-pipeline
gh pr create --draft --title "⚙️ Add CI/CD pipeline" --body "$(cat <<'EOF'
## Summary

- Adds `ci.yml`: test gate → Docker build+push to GHCR → staging deploy (PR) / production deploy (tag)
- Adds `release.yml`: manual semver bump, GitHub Release creation, triggers CI
- Removes `tests.yml` (absorbed into `ci.yml` test job)

## Pre-merge checklist

- [ ] Add `FIRTH_SSH_KEY` secret to repo settings (Settings → Secrets → Actions)
- [ ] Confirm `/home/docker/sprouter-staging` and `/home/docker/sprouter` exist on `firth.water.gkhs.net` with a `docker-compose.yml` configured to pull from `ghcr.io/aquarion/sprouter`
- [ ] Confirm `sprouter` SSH user on firth has Docker access
EOF
)"
```

---

## Post-merge: Server setup checklist

These are one-time manual steps on the server before the first deploy will succeed:

1. Add `FIRTH_SSH_KEY` secret in GitHub repo settings (Settings → Secrets and variables → Actions)
2. Ensure `/home/docker/sprouter-staging/docker-compose.yml` exists and references `ghcr.io/aquarion/sprouter:staging`
3. Ensure `/home/docker/sprouter/docker-compose.yml` exists and references `ghcr.io/aquarion/sprouter:latest`
4. Ensure `sprouter` user on firth is in the `docker` group
