# Annealer: extracting Icon Composer rendering into a standalone package + GitHub Action

## Context

This project (repo directory `sprouter`, product name **Bloom**) generates
its Apple touch icon (`resources/icons/apple-touch-icon.png`) from an Apple
Icon Composer bundle (`resources/branding/bloom.icon/icon.json`) using a set
of Node scripts under `bin/icons/`. This is not a wrapper around
Xcode/`actool` — it's a from-scratch Node reimplementation (using `sharp`) of
Icon Composer's rendering: squircle masking, gradient compensation, P3 color
handling, and iOS 26 "liquid glass" specular effects, all reverse-engineered
empirically against Icon Composer's actual output (see `docs/branding.md`).
The rest of this document refers to this project as "Bloom".

Because it has no macOS/Xcode dependency, this logic is portable and worth
extracting so it can be reused across other projects, instead of living only
inside Bloom's `bin/icons/`.

**Important scope constraint discovered during investigation:** the renderer
is not a general Icon Composer engine. It only handles the specific shape of
`bloom.icon`:

- A single `fill['automatic-gradient']` value (no `flat-color` fill, no
  multi-stop fills).
- Exactly one layer group, with `glass: true` always applied (no branch for
  `glass: false`).
- A glyph SVG parsed via a regex expecting exactly one `<path d="...">` (no
  multi-path/multi-group glyphs).
- Empirically-tuned constants (gradient lift, specular parameters, squircle
  corner radius) calibrated against this one icon and the current Icon
  Composer/macOS version.

Per discussion, this project extracts the code **as-is** and documents this
constraint rather than generalizing the renderer first. Icons outside the
supported shape are out of scope; contributions to extend support are
welcome later but are not part of this project.

## Goals

- Move the icon-generation logic out of Bloom into a standalone,
  publicly-usable project ("Annealer") so it can be reused in other projects
  without duplicating code.
- Provide both an npm package (for direct/local/CLI use) and a thin GitHub
  Action wrapper around it (for CI use), so consumers aren't forced into
  either mode.
- Migrate Bloom to depend on the extracted package rather than keeping a
  local copy, so there is a single source of truth.
- Preserve current rendering output exactly — this is an extraction, not a
  rewrite. No visual/behavioral changes to the generated icons.

## Non-goals

- Generalizing the renderer to support other Icon Composer fill types,
  multiple layer groups, `glass: false`, or multi-path glyphs, **as part of
  this extraction project**. These gaps are filed as tracked issues in the
  new repo once it's created (see Scope statement below), so the work isn't
  lost — they're just not blocking or in-scope for the extraction itself.
- Running on `macos-latest` or shelling out to Xcode/`actool` — the whole
  point is that this doesn't need to.
- Changing Bloom's build pipeline or `vite-plugin.js` integration pattern
  beyond what's needed to consume the new package.

## Architecture

### New repo: Annealer

A new public GitHub repo under the `istic` org (`github.com/istic/annealer`),
structured as an ESM npm package with a CLI entry point and a composite
GitHub Action wrapper.

```
annealer/
  src/
    generate-apple-touch-icon.js   # moved from bin/icons/, unchanged logic
    generate-web-icons.js          # moved from bin/icons/, unchanged logic
    pack-ico.js                    # moved from bin/icons/, unchanged logic
    colors.js                      # moved from bin/icons/, unchanged logic
    squircle.js                    # moved from bin/icons/, unchanged logic
    *.test.js                      # existing tests, moved alongside
  bin/
    cli.js                         # new: CLI wrapper (doesn't exist today)
  action.yml                       # new: composite GitHub Action
  package.json                     # sharp as the only runtime dependency
  README.md                        # documents supported icon.json shape
```

- **Package exports**: `generateAppleTouchIcon()`, `generateWebIcons()`,
  `packIco()`, and the shared helpers, unchanged from their current
  implementations in Sprouter.
- **New CLI entry point** (`bin/cli.js`): today these functions are only
  called from Sprouter's `vite-plugin.js`. Annealer needs a standalone
  invocation path for both the Action and direct CLI use. Flags:
  `--icon-path <path to .icon bundle>`, `--output-dir <dir>`, plus flags for
  whichever generator(s) to run (apple / web / ico / all).
- **GitHub Action** (`action.yml`): a composite action that runs `npm ci`
  against a pinned dependency set, then invokes `node bin/cli.js` with the
  action's inputs mapped to CLI flags. Runs on `ubuntu-latest` — no macOS
  runner needed.
- **Runtime dependency**: `sharp` only, matching what Sprouter uses today.
- **CI**: the new repo gets its own `ci.yml` running the moved vitest suite
  on PRs, independent of Sprouter's CI.

### Scope statement (README)

The README leads with the supported-shape constraint verbatim (single
`automatic-gradient` fill, one glass-enabled layer group, single-path
glyph), states that other shapes are out of scope for now, and points to
the tracked issues below for extending support. No runtime validation is
added to detect unsupported shapes (per discussion) — unsupported input may
silently produce incorrect output, same as today.

Once the repo exists, file one GitHub issue per known gap so the work is
tracked rather than just documented as a limitation:
- Support `flat-color` (and other non-`automatic-gradient`) fills.
- Support `glass: false` layers (no specular/blur treatment).
- Support multiple layer groups.
- Support multi-path/multi-group glyph SVGs (current regex only matches a
  single `<path d="...">`).

### Bloom migration

- Delete `bin/icons/generate-apple-touch-icon.js`, `generate-web-icons.js`,
  `pack-ico.js`, `colors.js`, `squircle.js`, and their `*.test.js` files.
  Keep `bin/icons/vite-plugin.js` in Bloom — it's app-specific Vite glue,
  not generic rendering logic — but update its imports to pull
  `generateAppleTouchIcon` / `generateWebIcons` / `packIco` from the new
  package instead of local relative paths.
  Keep `resources/branding/bloom.icon/` and
  `resources/branding/icon-config.json` — these are data, not code.
- Add Annealer as a `devDependency` in `package.json`.
- Add a smoke test for `vite-plugin.js` if one doesn't already exist,
  covering the integration point now that the generator logic itself is
  tested only in the Annealer repo.

## Testing / verification

- Annealer's own vitest suite (moved largely as-is from Sprouter) covers the
  generator logic in isolation.
- Extraction correctness is verified by regenerating
  `resources/icons/apple-touch-icon.png` (and the web icons/ico) from
  Bloom via the new package and diffing against the currently committed
  output — expected to be pixel-identical, since no logic changes.
- The Action itself is exercised by having Bloom's CI/build call it
  (dogfooding) once the migration lands, rather than requiring a second
  consumer project before shipping.

## Open items for implementation planning

- Exact npm package name (repo/org is settled: `istic/annealer`).
- License for the public repo (not yet decided).
