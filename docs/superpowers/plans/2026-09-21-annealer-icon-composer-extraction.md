# Annealer Icon Composer Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Bloom's Icon Composer rendering logic (`bin/icons/`) into a standalone public npm package + GitHub Action called Annealer, and migrate Bloom to depend on it.

**Architecture:** A new repo `istic/annealer` holds the rendering logic (moved verbatim except for one required generalization: the Apple-icon renderer's hardcoded `ICON_DIR` becomes a `config.iconPath` parameter), a new CLI entry point, and a composite GitHub Action that runs the CLI. Bloom (this repo) then deletes its local copy of the logic and depends on `@istic/annealer` instead, keeping only its Vite integration glue.

**Tech Stack:** Node.js (ESM), `sharp`, `vitest`, plain `node:util.parseArgs` for the CLI (no extra CLI framework dependency), GitHub composite Action.

**Spec:** `docs/superpowers/specs/2026-09-21-annealer-icon-composer-extraction-design.md`

## Global Constraints

- New repo: `github.com/istic/annealer`, public.
- npm package name: `@istic/annealer`.
- License: MIT.
- Node version for CI/Action: `22`.
- `sharp` version: `^0.35.3` (matches Bloom's current pin).
- `vitest` version: `^4.1.10` (matches Bloom's current pin).
- Rendering logic moves **as-is** — no behavioral changes except the `ICON_DIR` → `config.iconPath` generalization required for the package to be usable outside Bloom. No new input validation is added for unsupported icon.json shapes (per design decision — unsupported input may silently render incorrectly, same as today).
- Known format-support gaps (flat-color fill, `glass: false`, multiple layer groups, multi-path glyphs) and the hardcoded Bloom-branded web-icon filenames are **not** fixed in this plan — they're filed as GitHub issues in the new repo (Task 11) so the work is tracked, not lost.
- Any action that creates the public repo, publishes to npm, or opens a PR must be confirmed with the user before running (per the assistant's standing safety rules) — this plan calls those out explicitly where they occur.

---

## Part A — New repo: Annealer (`~/code/istic/annealer`)

All tasks in Part A operate in a new directory `~/code/istic/annealer`, on a single working branch `bootstrap` created in Task 1. Commit after every task.

### Task 1: Scaffold the Annealer repository

**Files:**
- Create (new repo): `package.json`, `.gitignore`, `LICENSE`, `README.md` (stub — filled in fully in Task 9)

**Interfaces:**
- Produces: the `@istic/annealer` package skeleton that every later task adds files into.

- [ ] **Step 1: Create the GitHub repo (confirm with user first — this is a public, visible action)**

```bash
cd ~/code/istic
gh repo create annealer --public \
  --description "Render Apple Icon Composer bundles and web favicons in plain Node.js — no Xcode required." \
  --clone
cd annealer
git checkout -b bootstrap
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "@istic/annealer",
  "version": "0.1.0",
  "description": "Render Apple Icon Composer bundles and web favicons in plain Node.js — no Xcode required.",
  "type": "module",
  "license": "MIT",
  "author": "Aquarion",
  "repository": {
    "type": "git",
    "url": "https://github.com/istic/annealer.git"
  },
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js"
  },
  "bin": {
    "annealer": "bin/cli.js"
  },
  "files": [
    "src",
    "bin",
    "action.yml"
  ],
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "sharp": "^0.35.3"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
```

- [ ] **Step 4: Write `LICENSE`** (MIT, copyright Aquarion, 2026)

```
MIT License

Copyright (c) 2026 Aquarion

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Write a stub `README.md`**

```markdown
# Annealer

Render an Apple Icon Composer bundle (`.icon`) and its companion web
favicons in plain Node.js — no Xcode, no `actool`, no macOS runner.

Full documentation coming in a later commit on this branch.
```

- [ ] **Step 6: Install dependencies and commit**

```bash
npm install
git add package.json package-lock.json .gitignore LICENSE README.md
git commit -m "chore: scaffold package"
git push -u origin bootstrap
```

---

### Task 2: Move `colors.js`

**Files:**
- Create: `src/colors.js`, `src/colors.test.js` (ported unchanged from Bloom's `bin/icons/colors.js` / `colors.test.js`)

**Interfaces:**
- Produces: `hexToRgb(hex)`, `rgbToHex([r,g,b])`, `hexToDisplayP3(hex)`, `compensateForAppleRender(hex)`, `p3StringToAppleRgb(p3Str)` — used by Task 6 (apple-touch-icon renderer).

- [ ] **Step 1: Write `src/colors.js`**

```js
// D65 matrices, ported from regen-icons.sh's hex_to_display_p3 Python heredoc.
const SRGB_TO_XYZ = [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.072175],
    [0.0193339, 0.119192, 0.9503041],
];

const XYZ_TO_P3 = [
    [2.4934969, -0.9313836, -0.4027108],
    [-0.829489, 1.762664, 0.0236247],
    [0.0358458, -0.0761724, 0.9568845],
];

// Empirical per-channel darkening observed in apple-touch-icon output vs the
// requested background color, ported from regen-icons.sh's DARKEN constant.
const APPLE_RENDER_DARKEN = [
    0.6022727272727273, 0.4375, 0.7962962962962963,
];

function multiply(matrix, vector) {
    return matrix.map((row) =>
        row.reduce((sum, value, index) => sum + value * vector[index], 0),
    );
}

function srgbToLinear(channel) {
    return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex) {
    const raw = hex.replace('#', '');

    return [0, 2, 4].map((offset) => Number.parseInt(raw.slice(offset, offset + 2), 16));
}

export function rgbToHex([r, g, b]) {
    return `#${[r, g, b]
        .map((channel) => channel.toString(16).padStart(2, '0').toUpperCase())
        .join('')}`;
}

export function hexToDisplayP3(hex) {
    const linear = hexToRgb(hex).map((channel) => srgbToLinear(channel / 255));
    const xyz = multiply(SRGB_TO_XYZ, linear);
    const p3 = multiply(XYZ_TO_P3, xyz).map((channel) => Math.min(1, Math.max(0, channel)));

    return `display-p3:${p3.map((channel) => channel.toFixed(5)).join(',')},1.00000`;
}

export function compensateForAppleRender(hex) {
    const compensated = hexToRgb(hex).map((channel, index) =>
        Math.min(255, Math.max(0, Math.round(channel / APPLE_RENDER_DARKEN[index]))),
    );

    return rgbToHex(compensated);
}

// Apple's icon tool stores gamma-encoded P3 components directly in the sRGB
// container without gamut conversion. This replicates that quirk so the
// background color used for icon rendering matches the old pipeline exactly.
export function p3StringToAppleRgb(p3Str) {
    const match = p3Str.match(/display-p3:([\d.]+),([\d.]+),([\d.]+)/);

    if (!match) {
        throw new Error(`p3StringToAppleRgb: cannot parse "${p3Str}"`);
    }

    return [match[1], match[2], match[3]].map((v) => Math.round(Number(v) * 255));
}
```

- [ ] **Step 2: Write `src/colors.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { compensateForAppleRender, hexToDisplayP3, hexToRgb, p3StringToAppleRgb } from './colors.js';

describe('hexToRgb', () => {
    it('parses a hex string into RGB channel values', () => {
        expect(hexToRgb('#6A2AAC')).toEqual([106, 42, 172]);
    });
});

describe('hexToDisplayP3', () => {
    it('converts the brand purple to a Display P3 string', () => {
        expect(hexToDisplayP3('#6A2AAC')).toBe(
            'display-p3:0.12267,0.02717,0.37968,1.00000',
        );
    });

    it('converts black to zeroed P3 components', () => {
        expect(hexToDisplayP3('#000000')).toBe(
            'display-p3:0.00000,0.00000,0.00000,1.00000',
        );
    });
});

describe('compensateForAppleRender', () => {
    it('lightens the brand purple to counter Apple darkening', () => {
        expect(compensateForAppleRender('#6A2AAC')).toBe('#B060D8');
    });

    it('leaves black and white unaffected', () => {
        expect(compensateForAppleRender('#000000')).toBe('#000000');
        expect(compensateForAppleRender('#FFFFFF')).toBe('#FFFFFF');
    });
});

describe('p3StringToAppleRgb', () => {
    it('treats P3 components as sRGB matching Apple icon tool quirk', () => {
        // display-p3:0.37790,0.12750,0.64098 -> rgb(96, 33, 163) not rgb(176, 96, 216)
        expect(p3StringToAppleRgb('display-p3:0.37790,0.12750,0.64098,1.00000')).toEqual([96, 33, 163]);
    });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/colors.test.js`
Expected: PASS (4 test cases)

- [ ] **Step 4: Commit**

```bash
git add src/colors.js src/colors.test.js
git commit -m "feat: add color conversion helpers"
```

---

### Task 3: Move `squircle.js`

**Files:**
- Create: `src/squircle.js`, `src/squircle.test.js` (ported unchanged)

**Interfaces:**
- Produces: `generateSquirclePath(size, exponent)` — used by Task 6.

- [ ] **Step 1: Write `src/squircle.js`**

```js
// Quintic superellipse (n=5 by convention here) path generator matching
// Apple's squircle shape, traced in one-degree steps from the rightmost point.
export function generateSquirclePath(size, exponent) {
    const radius = size / 2;
    const center = size / 2;
    let path = `M ${radius + center},${center} `;

    for (let degrees = 0; degrees <= 360; degrees += 1) {
        const angle = (degrees * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = Math.abs(cos) ** (2 / exponent) * radius * Math.sign(cos) + center;
        const y = Math.abs(sin) ** (2 / exponent) * radius * Math.sign(sin) + center;

        path += `L ${x},${y} `;
    }

    return `${path}Z`;
}
```

- [ ] **Step 2: Write `src/squircle.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { generateSquirclePath } from './squircle.js';

describe('generateSquirclePath', () => {
    it('starts at the rightmost point and closes the path', () => {
        const path = generateSquirclePath(1024, 5);

        expect(path.startsWith('M 1024,512 ')).toBe(true);
        expect(path.endsWith('Z')).toBe(true);
    });

    it('draws one line segment per degree of the sweep', () => {
        const path = generateSquirclePath(1024, 5);

        expect(path.split('L').length - 1).toBe(361);
    });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/squircle.test.js`
Expected: PASS (2 test cases)

- [ ] **Step 4: Commit**

```bash
git add src/squircle.js src/squircle.test.js
git commit -m "feat: add squircle path generator"
```

---

### Task 4: Move `pack-ico.js`

**Files:**
- Create: `src/pack-ico.js`, `src/pack-ico.test.js` (ported unchanged)

**Interfaces:**
- Produces: `packIco(pngBuffers)`, `readPngDimensions(png)` — used by Task 5 (`generate-web-icons.js`).

- [ ] **Step 1: Write `src/pack-ico.js`**

```js
/* global Buffer */

const HEADER_SIZE = 6;
const DIRECTORY_ENTRY_SIZE = 16;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readPngDimensions(png) {
    if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
        throw new Error('readPngDimensions: buffer is not a PNG image');
    }

    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

// Builds a multi-frame .ico container directly from PNG buffers — the format
// every modern browser and OS supports since Windows Vista. Frames at or above
// 256px store 0 in the (single-byte) directory width/height fields; readers
// fall back to the embedded PNG's own dimensions, which is exactly how
// ImageMagick encodes the existing favicon.ico's 512px frame.
export function packIco(pngBuffers) {
    const directorySize = DIRECTORY_ENTRY_SIZE * pngBuffers.length;
    const header = Buffer.alloc(HEADER_SIZE);

    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: icon
    header.writeUInt16LE(pngBuffers.length, 4);

    const directory = Buffer.alloc(directorySize);
    let dataOffset = HEADER_SIZE + directorySize;

    pngBuffers.forEach((png, index) => {
        const { width, height } = readPngDimensions(png);
        const entry = index * DIRECTORY_ENTRY_SIZE;

        directory.writeUInt8(width >= 256 ? 0 : width, entry);
        directory.writeUInt8(height >= 256 ? 0 : height, entry + 1);
        directory.writeUInt8(0, entry + 2); // palette colors (none)
        directory.writeUInt8(0, entry + 3); // reserved
        directory.writeUInt16LE(1, entry + 4); // color planes
        directory.writeUInt16LE(32, entry + 6); // bits per pixel
        directory.writeUInt32LE(png.length, entry + 8);
        directory.writeUInt32LE(dataOffset, entry + 12);

        dataOffset += png.length;
    });

    return Buffer.concat([header, directory, ...pngBuffers]);
}
```

- [ ] **Step 2: Write `src/pack-ico.test.js`**

```js
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { packIco, readPngDimensions } from './pack-ico.js';

async function solidPng(size) {
    return sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 },
        },
    })
        .png()
        .toBuffer();
}

describe('readPngDimensions', () => {
    it('reads width and height from a PNG buffer', async () => {
        const png = await solidPng(32);

        expect(readPngDimensions(png)).toEqual({ width: 32, height: 32 });
    });
});

describe('packIco', () => {
    it('builds an ICO container with one directory entry per frame', async () => {
        const sizes = [16, 256, 512];
        const frames = await Promise.all(sizes.map(solidPng));
        const ico = packIco(frames);

        expect(ico.readUInt16LE(0)).toBe(0); // reserved
        expect(ico.readUInt16LE(2)).toBe(1); // type: icon
        expect(ico.readUInt16LE(4)).toBe(sizes.length);

        let dataOffset = 6 + 16 * sizes.length;

        sizes.forEach((size, index) => {
            const entry = 6 + index * 16;
            const expectedDimensionByte = size >= 256 ? 0 : size;

            expect(ico.readUInt8(entry)).toBe(expectedDimensionByte);
            expect(ico.readUInt8(entry + 1)).toBe(expectedDimensionByte);
            expect(ico.readUInt16LE(entry + 4)).toBe(1); // color planes
            expect(ico.readUInt16LE(entry + 6)).toBe(32); // bits per pixel
            expect(ico.readUInt32LE(entry + 8)).toBe(frames[index].length);
            expect(ico.readUInt32LE(entry + 12)).toBe(dataOffset);

            const embedded = ico.subarray(dataOffset, dataOffset + frames[index].length);

            expect(readPngDimensions(embedded)).toEqual({ width: size, height: size });

            dataOffset += frames[index].length;
        });

        expect(ico.length).toBe(dataOffset);
    });
});
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/pack-ico.test.js`
Expected: PASS (2 test cases)

- [ ] **Step 4: Commit**

```bash
git add src/pack-ico.js src/pack-ico.test.js
git commit -m "feat: add ICO container packer"
```

---

### Task 5: Move `generate-web-icons.js`

**Files:**
- Create: `src/generate-web-icons.js`, `src/generate-web-icons.test.js`, `src/test-fixtures/glyph.svg` (ported unchanged)

**Interfaces:**
- Consumes: `packIco` from `./pack-ico.js` (Task 4).
- Produces: `generateWebIcons(config, outputDir)` where `config = { glyph: <path to glyph SVG>, backgroundColor: <hex> }` — used by Task 7 (CLI) and Task 12 (Bloom migration).

- [ ] **Step 1: Write `src/generate-web-icons.js`**

```js
/* global Buffer */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { packIco } from './pack-ico.js';

const DEFAULT_OUTPUT_DIR = 'resources/icons';
const CANVAS_SIZE = 1200;
const FAVICON_SIZES = [16, 32, 48, 64, 128, 256, 512];
const WHITE = '#FFFFFF';

function extractGlyphMarkup(svgMarkup) {
    const match = svgMarkup.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);

    if (!match) {
        throw new Error('extractGlyphMarkup: unable to parse glyph SVG');
    }

    return match[1].trim();
}

function buildCanvasSvg(glyphMarkup, backgroundColor) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="${backgroundColor}"/>
  ${glyphMarkup}
</svg>`;
}

async function writeOutput(outputDir, name, contents) {
    await fs.writeFile(path.join(outputDir, name), contents);
}

async function renderPng(svgBuffer, size) {
    return sharp(svgBuffer).resize(size, size).png().toBuffer();
}

export async function generateWebIcons(config, outputDir = DEFAULT_OUTPUT_DIR) {
    const glyphSource = await fs.readFile(config.glyph, 'utf-8');
    const glyphMarkup = extractGlyphMarkup(glyphSource);

    const standardSvg = buildCanvasSvg(glyphMarkup, config.backgroundColor);
    const onWhiteSvg = buildCanvasSvg(glyphMarkup, WHITE);
    const standardBuffer = Buffer.from(standardSvg);
    const onWhiteBuffer = Buffer.from(onWhiteSvg);

    await fs.mkdir(outputDir, { recursive: true });

    const faviconFrames = await Promise.all(FAVICON_SIZES.map((size) => renderPng(standardBuffer, size)));

    await Promise.all([
        writeOutput(outputDir, 'favicon.svg', standardSvg),
        writeOutput(outputDir, 'bloom-standard.svg', standardSvg),
        writeOutput(outputDir, 'favicon.ico', packIco(faviconFrames)),
        renderPng(standardBuffer, 96).then((png) => writeOutput(outputDir, 'favicon-96x96.png', png)),
        renderPng(standardBuffer, 1200).then((png) => writeOutput(outputDir, 'bloom-standard.png', png)),
        renderPng(onWhiteBuffer, 1200).then((png) => writeOutput(outputDir, 'bloom-on-white.png', png)),
        renderPng(standardBuffer, 192).then((png) => writeOutput(outputDir, 'web-app-manifest-192x192.png', png)),
        renderPng(standardBuffer, 512).then((png) => writeOutput(outputDir, 'web-app-manifest-512x512.png', png)),
    ]);
}
```

Note: the `bloom-*` output filenames are hardcoded (carried over verbatim from Bloom). This is one of the gaps filed as an issue in Task 11 — not fixed here.

- [ ] **Step 2: Write `src/test-fixtures/glyph.svg`**

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="600" cy="600" r="400" fill="#FFFFFF"/>
</svg>
```

- [ ] **Step 3: Write `src/generate-web-icons.test.js`**

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { generateWebIcons } from './generate-web-icons.js';

const FIXTURE_GLYPH = path.join(import.meta.dirname, 'test-fixtures', 'glyph.svg');
const CONFIG = { glyph: FIXTURE_GLYPH, backgroundColor: '#6A2AAC' };

let outputDir;

afterEach(async () => {
    if (outputDir) {
        await fs.rm(outputDir, { recursive: true, force: true });
        outputDir = undefined;
    }
});

async function freshOutputDir() {
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annealer-web-icons-'));

    return outputDir;
}

describe('generateWebIcons', () => {
    it('renders every PNG variant at its expected size', async () => {
        const dir = await freshOutputDir();

        await generateWebIcons(CONFIG, dir);

        const expectations = {
            'favicon-96x96.png': { width: 96, height: 96 },
            'bloom-standard.png': { width: 1200, height: 1200 },
            'bloom-on-white.png': { width: 1200, height: 1200 },
            'web-app-manifest-192x192.png': { width: 192, height: 192 },
            'web-app-manifest-512x512.png': { width: 512, height: 512 },
        };

        for (const [name, expected] of Object.entries(expectations)) {
            const { width, height } = await sharp(path.join(dir, name)).metadata();

            expect({ width, height }).toEqual(expected);
        }
    });

    it('writes the SVG variants', async () => {
        const dir = await freshOutputDir();

        await generateWebIcons(CONFIG, dir);

        const favicon = await fs.readFile(path.join(dir, 'favicon.svg'), 'utf-8');
        const standard = await fs.readFile(path.join(dir, 'bloom-standard.svg'), 'utf-8');

        expect(favicon).toBe(standard);
        expect(favicon).toContain('fill="#6A2AAC"');
        expect(favicon).toContain('<circle');
    });

    it('renders favicon.ico with the full multi-resolution frame set', async () => {
        const dir = await freshOutputDir();

        await generateWebIcons(CONFIG, dir);

        const ico = await fs.readFile(path.join(dir, 'favicon.ico'));

        expect(ico.readUInt16LE(4)).toBe(7);
    });

    it('fills the standard variant with the configured background color', async () => {
        const dir = await freshOutputDir();

        await generateWebIcons(CONFIG, dir);

        const { data } = await sharp(path.join(dir, 'favicon-96x96.png'))
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Top-left corner sits outside the centered glyph, so it's pure background.
        expect([data[0], data[1], data[2]]).toEqual([0x6a, 0x2a, 0xac]);
    });

    it('fills the "on white" variant with a white background', async () => {
        const dir = await freshOutputDir();

        await generateWebIcons(CONFIG, dir);

        const { data } = await sharp(path.join(dir, 'bloom-on-white.png'))
            .raw()
            .toBuffer({ resolveWithObject: true });

        expect([data[0], data[1], data[2]]).toEqual([0xff, 0xff, 0xff]);
    });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/generate-web-icons.test.js`
Expected: PASS (5 test cases)

- [ ] **Step 5: Commit**

```bash
git add src/generate-web-icons.js src/generate-web-icons.test.js src/test-fixtures/glyph.svg
git commit -m "feat: add web icon generator"
```

---

### Task 6: Move and generalize `generate-apple-touch-icon.js`

The original hardcodes `ICON_DIR = 'resources/branding/bloom.icon'`. That only worked because the script lived inside Bloom. For Annealer to be usable by any project, this becomes `config.iconPath`, passed in by the caller (CLI flag `--icon-path`, or the npm consumer's own config). This is the one intentional logic change in this migration — everything else moves verbatim.

**Files:**
- Create: `src/generate-apple-touch-icon.js`, `src/generate-apple-touch-icon.test.js`, `src/test-fixtures/sample.icon/icon.json`, `src/test-fixtures/sample.icon/Assets/glyph.svg`

**Interfaces:**
- Consumes: `compensateForAppleRender`, `hexToDisplayP3`, `p3StringToAppleRgb` from `./colors.js` (Task 2); `generateSquirclePath` from `./squircle.js` (Task 3).
- Produces: `generateAppleTouchIcon(config, outputDir, { syncJson = true } = {})` where `config = { iconPath: <path to .icon bundle directory>, backgroundColor: <hex> }` — used by Task 7 (CLI) and Task 12 (Bloom migration).

- [ ] **Step 1: Write `src/test-fixtures/sample.icon/icon.json`**

```json
{
  "fill": {
    "automatic-gradient": "display-p3:0.37790,0.12750,0.64098,1.00000"
  },
  "groups": [
    {
      "layers": [
        {
          "glass": true,
          "hidden": false,
          "image-name": "glyph.svg",
          "name": "glyph",
          "position": {
            "scale": 0.77,
            "translation-in-points": [
              0,
              0
            ]
          }
        }
      ],
      "shadow": {
        "kind": "neutral",
        "opacity": 0.5
      },
      "translucency": {
        "enabled": true,
        "value": 0.5
      }
    }
  ],
  "supported-platforms": {
    "circles": [
      "watchOS"
    ],
    "squares": "shared"
  }
}
```

- [ ] **Step 2: Write `src/test-fixtures/sample.icon/Assets/glyph.svg`**

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
  <path d="M600,200 A400,400 0 1,1 599,200 Z" fill="#FFFFFF"/>
</svg>
```

- [ ] **Step 3: Write `src/generate-apple-touch-icon.js`**

```js
/* global Buffer */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { compensateForAppleRender, hexToDisplayP3, p3StringToAppleRgb } from './colors.js';
import { generateSquirclePath } from './squircle.js';

const DEFAULT_OUTPUT_DIR = 'resources/icons';
const SIZE = 1024;

// Apple's "automatic-gradient" lightens the top of the icon by ~40 RGB units,
// reaching the base color at ~70% of the height and staying flat below that.
const GRADIENT_LIFT = 40;

async function fileExists(filePath) {
    try {
        await fs.access(filePath);

        return true;
    } catch {
        return false;
    }
}

async function syncIconJsonGradient(jsonPath, compensatedHex, write = true) {
    const iconData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));

    iconData.fill = { ...iconData.fill, 'automatic-gradient': hexToDisplayP3(compensatedHex) };

    if (write) {
        await fs.writeFile(jsonPath, `${JSON.stringify(iconData, null, 2)}\n`, 'utf-8');
    }

    return iconData;
}

function backgroundLayer(rgb) {
    const [r, g, b] = rgb;
    const baseColor = `rgb(${r}, ${g}, ${b})`;
    const topColor = `rgb(${Math.min(255, r + GRADIENT_LIFT)}, ${Math.min(255, g + GRADIENT_LIFT)}, ${Math.min(255, b + GRADIENT_LIFT)})`;

    const squircleMask = Buffer.from(`
        <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
            <path d="${generateSquirclePath(SIZE, 5)}" fill="white" />
        </svg>
    `);

    const gradient = Buffer.from(`
        <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
            <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:${topColor}" />
                <stop offset="70%" style="stop-color:${baseColor}" />
                <stop offset="100%" style="stop-color:${baseColor}" />
            </linearGradient>
            <rect width="${SIZE}" height="${SIZE}" fill="url(#grad)" />
        </svg>
    `);

    return sharp(gradient).composite([{ input: squircleMask, blend: 'dest-in' }]).png().toBuffer();
}

async function glyphLayer(iconDir, group, layer) {
    const imagePath = path.join(iconDir, 'Assets', layer['image-name']);

    if (!(await fileExists(imagePath))) {
        return null;
    }

    const originalSvg = await fs.readFile(imagePath, 'utf-8');
    const pathMatch = originalSvg.match(/<path d="([^"]+)"/);

    if (!pathMatch) {
        return null;
    }

    const scale = layer.position?.scale || 1.0;
    // Apple's icon JSON expresses scale as a "coverage" fraction; its renderer
    // maps that to an effective layer size via a power curve — exponent ~0.35
    // empirically matches Xcode's output across the observable scale range.
    const renderedScale = scale ** 0.35;
    const layerSize = Math.round(SIZE * renderedScale);
    const layerOffset = Math.round((SIZE - layerSize) / 2);

    // Apple's translucency is a frosted-glass blend, not simple fill-opacity.
    // The interior petal pixels in the reference output match ~0.70 opacity for
    // translucency=0.5; specular highlights then push bright edges toward white.
    const translucency = group.translucency?.enabled ? (group.translucency.value ?? 0.5) : 1.0;
    const layerOpacity = Math.min(1.0, 0.4 + translucency * 0.55);

    const glassGlyphSvg = `
        <svg width="${layerSize}" height="${layerSize}" viewBox="0 0 1200 1200">
            <defs>
                <filter id="liquidGlass" x="-15%" y="-15%" width="130%" height="130%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="glowBlur" />
                    <feFlood flood-color="white" flood-opacity="0.3" result="glowFill" />
                    <feComposite in="glowFill" in2="glowBlur" operator="in" result="outerGlow" />
                    <feGaussianBlur in="SourceAlpha" stdDeviation="16" result="bump" />
                    <feSpecularLighting in="bump" surfaceScale="6" specularConstant="3" specularExponent="25" lighting-color="white" result="spec">
                        <fePointLight x="-300" y="-500" z="900" />
                    </feSpecularLighting>
                    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specLight" />
                    <feMerge>
                        <feMergeNode in="outerGlow" />
                        <feMergeNode in="SourceGraphic" />
                        <feMergeNode in="specLight" />
                    </feMerge>
                </filter>
            </defs>
            <path d="${pathMatch[1]}" fill="white" fill-opacity="${layerOpacity}" filter="url(#liquidGlass)" />
        </svg>
    `;

    const input = await sharp(Buffer.from(glassGlyphSvg)).png().toBuffer();

    return { input, top: layerOffset, left: layerOffset };
}

// Apple's squircle has a ~20px bright specular highlight along all edges,
// clipped to the squircle boundary: feMorphology erode carves a border ring,
// then a Gaussian blur softens it inward.
async function edgeGlowLayer() {
    const svg = `
        <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
            <defs>
                <filter id="edgeGlow" x="0%" y="0%" width="100%" height="100%">
                    <feMorphology in="SourceAlpha" operator="erode" radius="16" result="eroded" />
                    <feComposite in="SourceAlpha" in2="eroded" operator="arithmetic" k2="1" k3="-1" result="ring" />
                    <feGaussianBlur in="ring" stdDeviation="7" result="soft" />
                    <feFlood flood-color="white" flood-opacity="0.6" result="white" />
                    <feComposite in="white" in2="soft" operator="in" result="glow" />
                    <feComposite in="glow" in2="SourceAlpha" operator="in" />
                </filter>
            </defs>
            <path d="${generateSquirclePath(SIZE, 5)}" fill="white" filter="url(#edgeGlow)" />
        </svg>
    `;

    return { input: await sharp(Buffer.from(svg)).png().toBuffer(), top: 0, left: 0 };
}

// Apple's top-left corner has a stronger, crisper highlight. surfaceScale=51
// compensates for librsvg normalising bump gradients by 255; the low z=80
// point light makes interior normals near-zero while the TL corner's outward
// normal aligns with the light, creating a highlight that fades at TR/BR.
async function cornerSpecularLayer() {
    const svg = `
        <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
            <defs>
                <filter id="cornerSpec" x="0%" y="0%" width="100%" height="100%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="12" result="bump" />
                    <feSpecularLighting in="bump" surfaceScale="51" specularConstant="0.65" specularExponent="8" lighting-color="white" result="spec">
                        <fePointLight x="-100" y="-100" z="80" />
                    </feSpecularLighting>
                    <feComposite in="spec" in2="SourceAlpha" operator="in" />
                </filter>
            </defs>
            <path d="${generateSquirclePath(SIZE, 5)}" fill="white" filter="url(#cornerSpec)" />
        </svg>
    `;

    return { input: await sharp(Buffer.from(svg)).png().toBuffer(), top: 0, left: 0 };
}

export async function generateAppleTouchIcon(config, outputDir = DEFAULT_OUTPUT_DIR, { syncJson = true } = {}) {
    const iconDir = config.iconPath;
    const jsonPath = path.join(iconDir, 'icon.json');
    const compensatedHex = compensateForAppleRender(config.backgroundColor);
    const iconData = await syncIconJsonGradient(jsonPath, compensatedHex, syncJson);
    // Replicate Apple's icon tool quirk: P3 components are stored in the sRGB
    // container without gamut conversion, so we read them back the same way.
    const rgb = p3StringToAppleRgb(iconData.fill['automatic-gradient']);

    const composites = [{ input: await backgroundLayer(rgb), top: 0, left: 0 }];

    for (const group of iconData.groups || []) {
        for (const layer of group.layers || []) {
            const composite = await glyphLayer(iconDir, group, layer);

            if (composite) {
                composites.push(composite);
            }
        }
    }

    composites.push(await edgeGlowLayer());
    composites.push(await cornerSpecularLayer());

    await fs.mkdir(outputDir, { recursive: true });
    await sharp({
        create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .composite(composites)
        .toFile(path.join(outputDir, 'apple-touch-icon.png'));
}
```

- [ ] **Step 4: Write `src/generate-apple-touch-icon.test.js`**

Unlike the original (which read/wrote Bloom's real `resources/branding/bloom.icon/icon.json` in place), this copies the fixture `.icon` bundle into a fresh temp directory per test, so tests never mutate committed fixtures.

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compensateForAppleRender, hexToDisplayP3 } from './colors.js';
import { generateAppleTouchIcon } from './generate-apple-touch-icon.js';

const FIXTURE_ICON_DIR = path.join(import.meta.dirname, 'test-fixtures', 'sample.icon');
const CONFIG = { backgroundColor: '#6A2AAC' };

let outputDir;
let iconDir;

beforeEach(async () => {
    iconDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annealer-icon-'));
    await fs.cp(FIXTURE_ICON_DIR, iconDir, { recursive: true });
});

afterEach(async () => {
    await fs.rm(iconDir, { recursive: true, force: true });

    if (outputDir) {
        await fs.rm(outputDir, { recursive: true, force: true });
        outputDir = undefined;
    }
});

describe('generateAppleTouchIcon', () => {
    it(
        'renders a 1024x1024 RGBA PNG',
        async () => {
            outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annealer-apple-icon-'));

            await generateAppleTouchIcon({ ...CONFIG, iconPath: iconDir }, outputDir);

            const { width, height, channels } = await sharp(path.join(outputDir, 'apple-touch-icon.png')).metadata();

            expect({ width, height, channels }).toEqual({ width: 1024, height: 1024, channels: 4 });
        },
        20000,
    );

    it(
        "syncs icon.json's automatic-gradient to the compensated brand color",
        async () => {
            outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annealer-apple-icon-'));

            await generateAppleTouchIcon({ ...CONFIG, iconPath: iconDir }, outputDir);

            const iconData = JSON.parse(await fs.readFile(path.join(iconDir, 'icon.json'), 'utf-8'));

            expect(iconData.fill['automatic-gradient']).toBe(hexToDisplayP3(compensateForAppleRender(CONFIG.backgroundColor)));
        },
        20000,
    );
});
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/generate-apple-touch-icon.test.js`
Expected: PASS (2 test cases)

- [ ] **Step 6: Commit**

```bash
git add src/generate-apple-touch-icon.js src/generate-apple-touch-icon.test.js src/test-fixtures/sample.icon
git commit -m "feat: add apple touch icon renderer with configurable icon path"
```

---

### Task 7: Add the package entry point (`src/index.js`)

**Files:**
- Create: `src/index.js`

**Interfaces:**
- Consumes: all named exports from Tasks 2–6.
- Produces: the public API surface of `@istic/annealer` — re-exports everything an npm consumer or the CLI needs.

- [ ] **Step 1: Write `src/index.js`**

```js
export { compensateForAppleRender, hexToDisplayP3, hexToRgb, p3StringToAppleRgb, rgbToHex } from './colors.js';
export { generateSquirclePath } from './squircle.js';
export { packIco, readPngDimensions } from './pack-ico.js';
export { generateAppleTouchIcon } from './generate-apple-touch-icon.js';
export { generateWebIcons } from './generate-web-icons.js';
```

- [ ] **Step 2: Verify the barrel imports resolve**

Run: `node -e "import('./src/index.js').then((m) => console.log(Object.keys(m)))"`
Expected: prints an array containing all six exported names, no error.

- [ ] **Step 3: Commit**

```bash
git add src/index.js
git commit -m "feat: add package entry point"
```

---

### Task 8: Add the CLI (`bin/cli.js`)

**Files:**
- Create: `bin/cli.js`, `bin/cli.test.js`

**Interfaces:**
- Consumes: `generateAppleTouchIcon`, `generateWebIcons` from `../src/index.js` (Task 7).
- Produces: a `node bin/cli.js` entry point taking `--icon-path`, `--glyph`, `--background-color`, `--output-dir`, `--target` flags — used by Task 9 (Action) and directly via `npx @istic/annealer`.

- [ ] **Step 1: Write `bin/cli.js`**

```js
#!/usr/bin/env node
/* global process */
import { parseArgs } from 'node:util';
import { generateAppleTouchIcon, generateWebIcons } from '../src/index.js';

const { values } = parseArgs({
    options: {
        'icon-path': { type: 'string', default: '' },
        glyph: { type: 'string', default: '' },
        'background-color': { type: 'string', default: '' },
        'output-dir': { type: 'string', default: 'resources/icons' },
        target: { type: 'string', default: 'all' },
    },
});

export async function main() {
    if (!values['background-color']) {
        throw new Error('--background-color is required');
    }

    const config = {
        backgroundColor: values['background-color'],
        iconPath: values['icon-path'],
        glyph: values.glyph,
    };

    if (values.target === 'apple' || values.target === 'all') {
        if (!config.iconPath) {
            throw new Error('--icon-path is required for the apple target');
        }

        await generateAppleTouchIcon(config, values['output-dir']);
    }

    if (values.target === 'web' || values.target === 'all') {
        if (!config.glyph) {
            throw new Error('--glyph is required for the web target');
        }

        await generateWebIcons(config, values['output-dir']);
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x bin/cli.js
```

- [ ] **Step 3: Write `bin/cli.test.js`**

```js
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.join(import.meta.dirname, 'cli.js');
const FIXTURE_ICON_DIR = path.join(import.meta.dirname, '..', 'src', 'test-fixtures', 'sample.icon');
const FIXTURE_GLYPH = path.join(import.meta.dirname, '..', 'src', 'test-fixtures', 'glyph.svg');

let outputDir;

afterEach(async () => {
    if (outputDir) {
        await fs.rm(outputDir, { recursive: true, force: true });
        outputDir = undefined;
    }
});

describe('cli', () => {
    it(
        'generates both apple and web icons for target=all',
        async () => {
            outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annealer-cli-'));

            await execFileAsync('node', [
                CLI_PATH,
                '--icon-path', FIXTURE_ICON_DIR,
                '--glyph', FIXTURE_GLYPH,
                '--background-color', '#6A2AAC',
                '--output-dir', outputDir,
                '--target', 'all',
            ]);

            const files = await fs.readdir(outputDir);

            expect(files).toContain('apple-touch-icon.png');
            expect(files).toContain('favicon.ico');
        },
        20000,
    );

    it('exits non-zero with a clear message when required flags are missing', async () => {
        outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'annealer-cli-'));

        await expect(
            execFileAsync('node', [CLI_PATH, '--output-dir', outputDir, '--target', 'apple']),
        ).rejects.toMatchObject({
            code: 1,
            stderr: expect.stringContaining('background-color is required'),
        });
    });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run bin/cli.test.js`
Expected: PASS (2 test cases)

- [ ] **Step 5: Commit**

```bash
git add bin/cli.js bin/cli.test.js
git commit -m "feat: add CLI entry point"
```

---

### Task 9: Add the GitHub Action (`action.yml`)

**Files:**
- Create: `action.yml`

**Interfaces:**
- Consumes: `bin/cli.js` (Task 8), invoked via `node "${{ github.action_path }}/bin/cli.js"` so the Action works straight from the checked-out action repo without needing the package published to npm first.

- [ ] **Step 1: Write `action.yml`**

```yaml
name: 'Annealer'
description: 'Render Apple Icon Composer bundles and web favicons in plain Node.js — no Xcode required.'
branding:
  icon: 'image'
  color: 'purple'
inputs:
  icon-path:
    description: 'Path to the Apple Icon Composer (.icon) bundle. Required for the apple/all targets.'
    required: false
    default: ''
  glyph:
    description: 'Path to the glyph SVG used for web icon rendering. Required for the web/all targets.'
    required: false
    default: ''
  background-color:
    description: 'Background color as a hex string, e.g. #6A2AAC.'
    required: true
  output-dir:
    description: 'Directory to write generated icons into.'
    required: false
    default: 'resources/icons'
  target:
    description: 'Which icons to generate: apple, web, or all.'
    required: false
    default: 'all'
runs:
  using: 'composite'
  steps:
    - name: Install Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '22'
    - name: Install Annealer's dependencies
      shell: bash
      run: npm ci --prefix "${{ github.action_path }}"
    - name: Generate icons
      shell: bash
      run: |
        node "${{ github.action_path }}/bin/cli.js" \
          --icon-path "${{ inputs.icon-path }}" \
          --glyph "${{ inputs.glyph }}" \
          --background-color "${{ inputs.background-color }}" \
          --output-dir "${{ inputs.output-dir }}" \
          --target "${{ inputs.target }}"
```

- [ ] **Step 2: Commit**

```bash
git add action.yml
git commit -m "feat: add composite GitHub Action"
```

---

### Task 10: Write the full README

**Files:**
- Modify: `README.md` (replace the Task 1 stub)

- [ ] **Step 1: Replace `README.md`**

```markdown
# Annealer

Render an Apple Icon Composer bundle (`.icon`) and its companion web
favicons in plain Node.js — no Xcode, no `actool`, no macOS runner.

Annealer is a from-scratch reimplementation of Icon Composer's rendering
(squircle masking, gradient compensation, Display P3 color handling, and
iOS 26 "liquid glass" specular effects), reverse-engineered empirically
against Icon Composer's actual output. It ships as an npm package, a CLI,
and a GitHub Action.

## Supported icon shape

Annealer currently supports exactly one Icon Composer shape:

- A single `fill['automatic-gradient']` value (no `flat-color` fill, no
  multi-stop fills).
- Exactly one layer group, with `glass: true` on its layer (no
  `glass: false` rendering path).
- A glyph SVG with exactly one `<path d="...">` element (no multi-path or
  multi-group glyphs).

Icons outside this shape will render incorrectly rather than fail loudly.
See the [issue tracker](https://github.com/istic/annealer/issues) for
tracked gaps, and feel free to open a PR to extend support.

The web-icon filenames (`bloom-standard.svg`, `bloom-standard.png`,
`bloom-on-white.png`) are currently hardcoded from Annealer's origin
project and not yet configurable — also tracked in the issue tracker.

## Usage

### As a GitHub Action

```yaml
- uses: istic/annealer@v1
  with:
    icon-path: resources/branding/my-app.icon
    glyph: resources/branding/glyph.svg
    background-color: '#6A2AAC'
    output-dir: resources/icons
```

### As a CLI

```sh
npx @istic/annealer \
  --icon-path resources/branding/my-app.icon \
  --glyph resources/branding/glyph.svg \
  --background-color '#6A2AAC' \
  --output-dir resources/icons
```

### As an npm package

```js
import { generateAppleTouchIcon, generateWebIcons } from '@istic/annealer';

const config = {
  iconPath: 'resources/branding/my-app.icon',
  glyph: 'resources/branding/glyph.svg',
  backgroundColor: '#6A2AAC',
};

await generateAppleTouchIcon(config, 'resources/icons');
await generateWebIcons(config, 'resources/icons');
```

## Development

```sh
npm install
npm test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: write full README"
```

---

### Task 11: Add CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: npm test
```

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run tests on push and pull request"
git push
```

- [ ] **Step 3: Open a draft PR and confirm CI passes (confirm with user before opening)**

```bash
gh pr create --draft --title "Bootstrap Annealer" --body "Initial extraction of Icon Composer rendering from Bloom (aquarion/sprouter)."
```

Check the PR's Actions tab (or `gh pr checks`) until the `test` job is green before moving on. Do not merge — leave the draft PR for the user to review and merge.

---

### Task 12: File tracked issues for known gaps

Do this after the PR in Task 11 is open, in the same `istic/annealer` repo. Confirm with the user before creating (issues are visible to anyone who can see the repo).

- [ ] **Step 1: File the fill-type gap**

```bash
gh issue create --repo istic/annealer \
  --title "Support flat-color and multi-stop fills" \
  --body "generateAppleTouchIcon only reads fill['automatic-gradient']. icon.json bundles using a flat-color fill or a multi-stop fill render incorrectly (silently) instead of being supported or rejected. See src/generate-apple-touch-icon.js's syncIconJsonGradient/backgroundLayer."
```

- [ ] **Step 2: File the glass:false gap**

```bash
gh issue create --repo istic/annealer \
  --title "Support glass: false layers" \
  --body "glyphLayer() in src/generate-apple-touch-icon.js always applies the liquid-glass specular/blur filter to every layer, with no branch for glass: false. Layers configured without glass render with an effect they didn't ask for."
```

- [ ] **Step 3: File the multi-group gap**

```bash
gh issue create --repo istic/annealer \
  --title "Support multiple layer groups" \
  --body "generateAppleTouchIcon iterates iconData.groups and renders every layer the same way, but only a single-group icon.json has been validated. Multi-group compositing order/blending is untested and likely wrong."
```

- [ ] **Step 4: File the multi-path glyph gap**

```bash
gh issue create --repo istic/annealer \
  --title "Support multi-path and multi-group glyph SVGs" \
  --body "glyphLayer() extracts the glyph via a regex expecting exactly one <path d=\"...\"> element in the source SVG. Glyphs with multiple paths or nested groups fail to match and are silently skipped (glyphLayer returns null)."
```

- [ ] **Step 5: File the hardcoded filenames gap**

```bash
gh issue create --repo istic/annealer \
  --title "Make web-icon output filenames configurable" \
  --body "generateWebIcons() hardcodes bloom-standard.svg, bloom-standard.png, and bloom-on-white.png as output filenames — leftover branding from Annealer's origin project (Bloom). These should come from config so other projects don't get Bloom-branded filenames."
```

---

## Part B — Migrate Bloom (this repo, `sprouter`) to depend on Annealer

Part B happens back in this repo. Requires `@istic/annealer` to be published to npm first (Task 13).

### Task 13: Publish `@istic/annealer` to npm (confirm with user before running — this is irreversible and public)

- [ ] **Step 1: Publish**

```bash
cd ~/code/istic/annealer
npm publish --access public
```

- [ ] **Step 2: Verify**

Run: `npm view @istic/annealer version`
Expected: prints `0.1.0`

---

### Task 14: Switch Bloom's branch and add the dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Create a feature branch from up-to-date main**

```bash
cd /Users/aquarion/code/aquarion/sprouter
git checkout main
git pull
git checkout -b feature/annealer-migration
```

- [ ] **Step 2: Add the dependency**

```bash
npm install --save-dev @istic/annealer@^0.1.0
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "🔄️ add @istic/annealer devDependency"
```

---

### Task 15: Delete the extracted files and update `vite-plugin.js`

**Files:**
- Delete: `bin/icons/colors.js`, `bin/icons/colors.test.js`, `bin/icons/squircle.js`, `bin/icons/squircle.test.js`, `bin/icons/pack-ico.js`, `bin/icons/pack-ico.test.js`, `bin/icons/generate-apple-touch-icon.js`, `bin/icons/generate-apple-touch-icon.test.js`, `bin/icons/generate-web-icons.js`, `bin/icons/generate-web-icons.test.js`, `bin/icons/test-fixtures/` (whole directory)
- Modify: `bin/icons/vite-plugin.js`, `resources/branding/icon-config.json`

- [ ] **Step 1: Delete the extracted files**

```bash
git rm bin/icons/colors.js bin/icons/colors.test.js \
  bin/icons/squircle.js bin/icons/squircle.test.js \
  bin/icons/pack-ico.js bin/icons/pack-ico.test.js \
  bin/icons/generate-apple-touch-icon.js bin/icons/generate-apple-touch-icon.test.js \
  bin/icons/generate-web-icons.js bin/icons/generate-web-icons.test.js
git rm -r bin/icons/test-fixtures
```

- [ ] **Step 2: Add `iconPath` to `resources/branding/icon-config.json`**

```json
{
    "glyph": "resources/branding/noun-bloom-5179258-FFFFFF.svg",
    "iconPath": "resources/branding/bloom.icon",
    "backgroundColor": "#6A2AAC",
    "backgroundColors": {
        "local": "#CC0000",
        "development": "#CC0000",
        "staging": "#CC7700",
        "production": "#6A2AAC"
    }
}
```

- [ ] **Step 3: Update `bin/icons/vite-plugin.js` to import from `@istic/annealer`**

Replace the two relative imports:

```js
import { generateAppleTouchIcon } from './generate-apple-touch-icon.js';
import { generateWebIcons } from './generate-web-icons.js';
```

with:

```js
import { generateAppleTouchIcon, generateWebIcons } from '@istic/annealer';
```

The rest of `bin/icons/vite-plugin.js` is unchanged — `iconConfig` already gets spread into `config`, so `config.iconPath` now flows through automatically from the `icon-config.json` change in Step 2.

- [ ] **Step 4: Commit**

```bash
git add bin/icons/vite-plugin.js resources/branding/icon-config.json
git commit -m "🔄️ delegate icon generation to @istic/annealer"
```

---

### Task 16: Verify identical output and run the full test suite

- [ ] **Step 1: Regenerate icons and diff against the committed output**

```bash
cp resources/icons/apple-touch-icon.png /tmp/apple-touch-icon-before.png
npx vite build --mode production
cmp /tmp/apple-touch-icon-before.png resources/icons/apple-touch-icon.png && echo "IDENTICAL" || echo "DIFFERS"
```

Expected: `IDENTICAL`. If it differs, diff the two PNGs visually before proceeding — this migration should not change rendered output.

- [ ] **Step 2: Run the JS test suite**

Run: `npm test`
Expected: PASS, with no remaining references to the deleted `bin/icons/*.test.js` files.

- [ ] **Step 3: Run the full check suite**

Run: `npm run lint:check && npm run types:check`
Expected: PASS (no lingering imports of the deleted files, no unused `bin/icons/vite-plugin.js` imports).

- [ ] **Step 4: Commit any remaining changes (e.g. rebuilt `public/build/` assets) and push**

```bash
git add -A
git commit -m "🔄️ regenerate build output" --allow-empty
git push -u origin feature/annealer-migration
```

- [ ] **Step 5: Open a draft PR (confirm with user before opening)**

```bash
gh pr create --draft --title "Migrate icon generation to @istic/annealer" --body "Replaces bin/icons/ generator scripts with the @istic/annealer package (extracted in istic/annealer). No behavioral change — verified apple-touch-icon.png output is identical before/after."
```
