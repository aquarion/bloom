# Icon Generation as Part of the Vite Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manually-run `bin/regen-icons.sh` (bash + ImageMagick + Python) and `bin/generate-apple-icon.js` scripts with a Vite plugin that regenerates every favicon/apple-touch-icon/PWA-manifest/brand-asset variant from a single declared brand source on every `dev`/`build` run.

**Architecture:** A new `resources/branding/icon-config.json` declares the glyph SVG and brand background color. Pure-function helpers (`bin/icons/colors.js`, `bin/icons/pack-ico.js`, `bin/icons/squircle.js`) handle color-space conversion, ICO container packing, and squircle path generation. Two generator modules (`bin/icons/generate-web-icons.js`, `bin/icons/generate-apple-touch-icon.js`) render the actual outputs via `sharp`. A Vite plugin (`bin/icons/vite-plugin.js`) runs both generators in its `buildStart` hook, and `vite.config.ts` is updated to load the plugin and list the generated files as build inputs. Generated files move from committed static assets to gitignored build artifacts.

**Tech Stack:** Node.js (ESM), `sharp` (already a devDependency), `vitest` (existing test runner), Vite plugin API.

---

## Spec Reference

Full design: `docs/superpowers/specs/2026-06-06-icon-generation-vite-pipeline-design.md`

## Reference Values (computed from the existing brand color `#6A2AAC`)

These were derived by running the *existing* `regen-icons.sh` Python conversion logic against known inputs, and are used as test fixtures below — they prove the new JS implementation matches the old bash/Python pipeline byte-for-byte:

| Input hex | `hexToDisplayP3` | `compensateForAppleRender` |
|---|---|---|
| `#6A2AAC` | `display-p3:0.12267,0.02717,0.37968,1.00000` | `#B060D8` |
| `#000000` | `display-p3:0.00000,0.00000,0.00000,1.00000` | `#000000` |
| `#FFFFFF` | `display-p3:1.00000,0.99998,0.99978,1.00000` | `#FFFFFF` |

---

### Task 1: Add the brand icon config

**Files:**
- Create: `resources/branding/icon-config.json`

- [ ] **Step 1: Write the config file**

```json
{
    "glyph": "resources/branding/noun-bloom-5179258-FFFFFF.svg",
    "backgroundColor": "#6A2AAC"
}
```

- [ ] **Step 2: Commit**

```bash
git add resources/branding/icon-config.json
git commit -m "🎇 Add brand icon config as single source of truth for icon generation"
```

---

### Task 2: Color conversion helpers

**Files:**
- Create: `bin/icons/colors.js`
- Test: `bin/icons/colors.test.js`

These port `regen-icons.sh`'s Python heredoc color math (`hex_to_display_p3` and
`compensate_hex_for_apple_render`) to plain JS, plus a small `hexToRgb` helper that
both this module and the apple-touch-icon generator need.

- [ ] **Step 1: Write the failing test**

```js
// bin/icons/colors.test.js
import { describe, expect, it } from 'vitest';
import { compensateForAppleRender, hexToDisplayP3, hexToRgb } from './colors.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bin/icons/colors.test.js`
Expected: FAIL with "Cannot find module './colors.js'" (or similar resolution error)

- [ ] **Step 3: Write the implementation**

```js
// bin/icons/colors.js

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bin/icons/colors.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/icons/colors.js bin/icons/colors.test.js
git commit -m "🎇 Port icon color-space helpers from regen-icons.sh to JS"
```

---

### Task 3: ICO packing helper

**Files:**
- Create: `bin/icons/pack-ico.js`
- Test: `bin/icons/pack-ico.test.js`

`sharp` cannot write multi-frame `.ico` containers, and the `to-ico` npm package
only supports frames up to 256px (it `Buffer.writeUInt8`s the raw size, which
throws for 512). Since the spec requires the favicon to keep its
16/32/48/64/128/256/512 frame set — and the existing `favicon.ico` already stores
its 512px frame as a directory entry with width/height bytes `0,0` (the standard
"PNG-compressed, oversized icon" convention supported by all modern readers) — we
hand-roll a small packer that wraps PNG buffers directly, which naturally supports
any size.

- [ ] **Step 1: Write the failing test**

```js
// bin/icons/pack-ico.test.js
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bin/icons/pack-ico.test.js`
Expected: FAIL with "Cannot find module './pack-ico.js'"

- [ ] **Step 3: Write the implementation**

```js
// bin/icons/pack-ico.js
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bin/icons/pack-ico.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/icons/pack-ico.js bin/icons/pack-ico.test.js
git commit -m "🎇 Add multi-resolution ICO packer for favicon generation"
```

---

### Task 4: Squircle path generator

**Files:**
- Create: `bin/icons/squircle.js`
- Test: `bin/icons/squircle.test.js`

Extracts the quintic-superellipse path generator that `generate-apple-icon.js`
currently defines inline and calls three times (mask, edge glow, corner specular)
into its own testable module.

- [ ] **Step 1: Write the failing test**

```js
// bin/icons/squircle.test.js
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

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bin/icons/squircle.test.js`
Expected: FAIL with "Cannot find module './squircle.js'"

- [ ] **Step 3: Write the implementation**

```js
// bin/icons/squircle.js

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bin/icons/squircle.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/icons/squircle.js bin/icons/squircle.test.js
git commit -m "🎇 Extract squircle path generator into its own testable module"
```

---

### Task 5: Web icon generator

**Files:**
- Create: `bin/icons/generate-web-icons.js`
- Create: `bin/icons/test-fixtures/glyph.svg`
- Test: `bin/icons/generate-web-icons.test.js`

Replaces `regen-icons.sh`. Renders the brand glyph composited onto the background
color (and onto white for the "on white" variant) via sharp/SVG, producing every
favicon, manifest, and brand-asset variant.

- [ ] **Step 1: Add a fixture glyph for tests**

```svg
<!-- bin/icons/test-fixtures/glyph.svg -->
<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="600" cy="600" r="400" fill="#FFFFFF"/>
</svg>
```

- [ ] **Step 2: Write the failing test**

```js
// bin/icons/generate-web-icons.test.js
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
    outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bloom-web-icons-'));
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

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run bin/icons/generate-web-icons.test.js`
Expected: FAIL with "Cannot find module './generate-web-icons.js'"

- [ ] **Step 4: Write the implementation**

```js
// bin/icons/generate-web-icons.js
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

    const faviconFrames = await Promise.all(
        FAVICON_SIZES.map((size) => renderPng(standardBuffer, size)),
    );

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

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run bin/icons/generate-web-icons.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add bin/icons/generate-web-icons.js bin/icons/generate-web-icons.test.js bin/icons/test-fixtures/glyph.svg
git commit -m "🎇 Add Node/sharp web icon generator replacing regen-icons.sh"
```

---

### Task 6: Apple touch icon generator

**Files:**
- Create: `bin/icons/generate-apple-touch-icon.js`
- Test: `bin/icons/generate-apple-touch-icon.test.js`

Adapts `bin/generate-apple-icon.js`'s rendering pipeline (squircle mask, gradient,
glass-glyph filter, edge glow, corner specular — all unchanged) to take its base
color from `compensateForAppleRender(config.backgroundColor)` directly, instead of
parsing it back out of `icon.json`'s `automatic-gradient` P3 string. It then writes
the freshly-computed P3 value back into `icon.json` so the file stays usable in
Xcode's Icon Composer (mirroring `regen-icons.sh --update-bloom-icon`).

- [ ] **Step 1: Write the failing test**

```js
// bin/icons/generate-apple-touch-icon.test.js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compensateForAppleRender, hexToDisplayP3 } from './colors.js';
import { generateAppleTouchIcon } from './generate-apple-touch-icon.js';

const ICON_JSON_PATH = path.join('resources/branding/bloom.icon', 'icon.json');
const CONFIG = { glyph: 'unused', backgroundColor: '#6A2AAC' };

let outputDir;
let originalIconJson;

beforeEach(async () => {
    originalIconJson = await fs.readFile(ICON_JSON_PATH, 'utf-8');
});

afterEach(async () => {
    await fs.writeFile(ICON_JSON_PATH, originalIconJson, 'utf-8');

    if (outputDir) {
        await fs.rm(outputDir, { recursive: true, force: true });
        outputDir = undefined;
    }
});

describe('generateAppleTouchIcon', () => {
    it('renders a 1024x1024 RGBA PNG', async () => {
        outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bloom-apple-icon-'));

        await generateAppleTouchIcon(CONFIG, outputDir);

        const { width, height, channels } = await sharp(
            path.join(outputDir, 'apple-touch-icon.png'),
        ).metadata();

        expect({ width, height, channels }).toEqual({ width: 1024, height: 1024, channels: 4 });
    });

    it("syncs icon.json's automatic-gradient to the compensated brand color", async () => {
        outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bloom-apple-icon-'));

        await generateAppleTouchIcon(CONFIG, outputDir);

        const iconData = JSON.parse(await fs.readFile(ICON_JSON_PATH, 'utf-8'));

        expect(iconData.fill['automatic-gradient']).toBe(
            hexToDisplayP3(compensateForAppleRender(CONFIG.backgroundColor)),
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run bin/icons/generate-apple-touch-icon.test.js`
Expected: FAIL with "Cannot find module './generate-apple-touch-icon.js'"

- [ ] **Step 3: Write the implementation**

```js
// bin/icons/generate-apple-touch-icon.js
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { compensateForAppleRender, hexToDisplayP3, hexToRgb } from './colors.js';
import { generateSquirclePath } from './squircle.js';

const ICON_DIR = 'resources/branding/bloom.icon';
const JSON_PATH = path.join(ICON_DIR, 'icon.json');
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

async function syncIconJsonGradient(compensatedHex) {
    const iconData = JSON.parse(await fs.readFile(JSON_PATH, 'utf-8'));

    iconData.fill = { ...iconData.fill, 'automatic-gradient': hexToDisplayP3(compensatedHex) };

    await fs.writeFile(JSON_PATH, `${JSON.stringify(iconData, null, 2)}\n`, 'utf-8');

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

async function glyphLayer(group, layer) {
    const imagePath = path.join(ICON_DIR, 'Assets', layer['image-name']);

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

export async function generateAppleTouchIcon(config, outputDir = DEFAULT_OUTPUT_DIR) {
    const compensatedHex = compensateForAppleRender(config.backgroundColor);
    const rgb = hexToRgb(compensatedHex);
    const iconData = await syncIconJsonGradient(compensatedHex);

    const composites = [{ input: await backgroundLayer(rgb), top: 0, left: 0 }];

    for (const group of iconData.groups || []) {
        for (const layer of group.layers || []) {
            const composite = await glyphLayer(group, layer);

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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run bin/icons/generate-apple-touch-icon.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add bin/icons/generate-apple-touch-icon.js bin/icons/generate-apple-touch-icon.test.js
git commit -m "🎇 Port apple-touch-icon generator to derive color from brand config"
```

---

### Task 7: Wire generation into the Vite build

**Files:**
- Create: `bin/icons/vite-plugin.js`
- Modify: `vite.config.ts:1-21`

- [ ] **Step 1: Write the plugin**

```js
// bin/icons/vite-plugin.js
import fs from 'node:fs/promises';
import { generateAppleTouchIcon } from './generate-apple-touch-icon.js';
import { generateWebIcons } from './generate-web-icons.js';

const CONFIG_PATH = 'resources/branding/icon-config.json';

export function iconGenerationPlugin() {
    return {
        name: 'bloom-icon-generation',
        async buildStart() {
            const config = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));

            await generateWebIcons(config);
            await generateAppleTouchIcon(config);
        },
    };
}
```

- [ ] **Step 2: Wire the plugin into `vite.config.ts` and update the input list**

Replace the top of `vite.config.ts` (the `import` block and the `laravel` plugin's
`input` array) so the file reads:

```ts
import inertia from "@inertiajs/vite";
import { wayfinder } from "@laravel/vite-plugin-wayfinder";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import laravel from "laravel-vite-plugin";
import { bunny } from "laravel-vite-plugin/fonts";
import { defineConfig } from "vite";
import { iconGenerationPlugin } from "./bin/icons/vite-plugin";

export default defineConfig({
	plugins: [
		iconGenerationPlugin(),
		laravel({
			input: [
				"resources/css/app.css",
				"resources/js/app.tsx",
				"resources/icons/apple-touch-icon.png",
				"resources/icons/favicon-96x96.png",
				"resources/icons/favicon.ico",
				"resources/icons/favicon.svg",
				"resources/icons/web-app-manifest-192x192.png",
				"resources/icons/web-app-manifest-512x512.png",
				"resources/icons/bloom-standard.png",
				"resources/icons/bloom-on-white.png",
			],
			refresh: true,
			fonts: [
				bunny("Instrument Sans", {
					weights: [400, 500, 600],
				}),
			],
		}),
```

(Everything from `inertia(),` onward stays unchanged.)

- [ ] **Step 3: Verify the dev server generates icons on startup**

Run: `npm run dev` (in the background, then stop it once you see output)
Expected: Vite starts without error, and `resources/icons/` now contains freshly
written `apple-touch-icon.png`, `favicon.svg`, `favicon-96x96.png`, `favicon.ico`,
`web-app-manifest-192x192.png`, `web-app-manifest-512x512.png`,
`bloom-standard.svg`, `bloom-standard.png`, `bloom-on-white.png` (check
modification timestamps with `ls -la resources/icons/`)

- [ ] **Step 4: Commit**

```bash
git add bin/icons/vite-plugin.js vite.config.ts
git commit -m "🔄️ Generate icons via a Vite plugin instead of static committed files"
```

---

### Task 8: Remove superseded scripts, static files, and cruft

**Files:**
- Delete: `bin/regen-icons.sh`
- Delete: `bin/generate-apple-icon.js`
- Delete (tracked, generated outputs): `resources/icons/apple-touch-icon.png`, `resources/icons/favicon.svg`, `resources/icons/favicon-96x96.png`, `resources/icons/favicon.ico`, `resources/icons/web-app-manifest-192x192.png`, `resources/icons/web-app-manifest-512x512.png`, `resources/icons/bloom-standard.svg`, `resources/icons/bloom-standard.png`, `resources/icons/bloom-on-white.png`, `resources/icons/sprouter-standard.svg`
- Delete (untracked cruft): `resources/icons/apple-touch-icon-original.png`, `resources/icons/spouter-on-white.png:Zone.Identifier`, `resources/icons/spouter-standard.png:Zone.Identifier`, `resources/icons/sprouter-standard.svg:Zone.Identifier`
- Modify: `.gitignore:39`

- [ ] **Step 1: Snapshot the current apple-touch-icon for later visual comparison**

Task 9 needs a "before" copy to compare the regenerated icon against, and this
file is about to be untracked and eventually overwritten:

```bash
cp resources/icons/apple-touch-icon.png /tmp/apple-touch-icon-before.png
```

- [ ] **Step 2: Remove the superseded generator scripts**

```bash
git rm bin/regen-icons.sh bin/generate-apple-icon.js
```

- [ ] **Step 3: Untrack the now-generated icon outputs**

```bash
git rm --cached \
    resources/icons/apple-touch-icon.png \
    resources/icons/favicon.svg \
    resources/icons/favicon-96x96.png \
    resources/icons/favicon.ico \
    resources/icons/web-app-manifest-192x192.png \
    resources/icons/web-app-manifest-512x512.png \
    resources/icons/bloom-standard.svg \
    resources/icons/bloom-standard.png \
    resources/icons/bloom-on-white.png
```

- [ ] **Step 4: Remove the pre-rename `sprouter-standard.svg` and Windows download cruft**

```bash
git rm resources/icons/sprouter-standard.svg
rm resources/icons/apple-touch-icon-original.png \
   "resources/icons/spouter-on-white.png:Zone.Identifier" \
   "resources/icons/spouter-standard.png:Zone.Identifier" \
   "resources/icons/sprouter-standard.svg:Zone.Identifier"
```

- [ ] **Step 5: Update `.gitignore`**

Find this line (around `.gitignore:39`):

```
resources/icons/apple-touch-icon-original.png
```

Replace it with the full set of generated icon outputs (the file it referenced no
longer exists or gets generated, so this single dead entry is replaced by the real
generated-output list):

```
resources/icons/apple-touch-icon.png
resources/icons/favicon.svg
resources/icons/favicon-96x96.png
resources/icons/favicon.ico
resources/icons/web-app-manifest-192x192.png
resources/icons/web-app-manifest-512x512.png
resources/icons/bloom-standard.svg
resources/icons/bloom-standard.png
resources/icons/bloom-on-white.png
```

- [ ] **Step 6: Verify the working tree is clean of the removed files**

Run: `git status --porcelain resources/icons/ bin/`
Expected: only the `.gitignore` modification and the `git rm` removals show as
staged changes — no untracked cruft remains in `resources/icons/`

- [ ] **Step 7: Commit**

```bash
git add .gitignore
git commit -m "🪳 Remove superseded icon scripts, static outputs, and rename-era cruft"
```

---

### Task 9: Full pipeline verification

**Files:** none (manual verification)

- [ ] **Step 1: Run the full test suite for the new modules**

Run: `npx vitest run bin/icons/`
Expected: PASS — all colors, pack-ico, squircle, generate-web-icons, and
generate-apple-touch-icon tests green

- [ ] **Step 2: Confirm a clean dev server run regenerates everything**

```bash
rm -rf resources/icons/*.png resources/icons/*.ico resources/icons/*.svg
npm run dev
```

Expected: server starts cleanly; `ls resources/icons/` shows all nine generated
files freshly written with current timestamps — `apple-touch-icon.png`,
`favicon.svg`, `favicon-96x96.png`, `favicon.ico`, `web-app-manifest-192x192.png`,
`web-app-manifest-512x512.png`, `bloom-standard.svg`, `bloom-standard.png`,
`bloom-on-white.png`. Every PNG/ICO/SVG in `resources/icons/` is now produced by
the pipeline, so nothing else should remain.

- [ ] **Step 3: Check the page in a browser**

With the dev server running, open the app in a browser and confirm:
- the browser tab favicon renders (check `resources/views/components/icons.blade.php` link tags resolve, no 404s in Network tab)
- `AuthorChip` and the app logo render the `bloom-standard.svg` import correctly
- visiting `/site.webmanifest` returns valid JSON with resolvable `icons[].src` URLs

- [ ] **Step 4: Run a production build**

```bash
npm run build
```

Expected: build succeeds; `public/build/manifest.json` contains entries for all
ten configured icon inputs (`apple-touch-icon.png`, `favicon-96x96.png`,
`favicon.ico`, `favicon.svg`, `web-app-manifest-192x192.png`,
`web-app-manifest-512x512.png`, `bloom-standard.png`, `bloom-on-white.png`, plus
`app.css`/`app.tsx`)

- [ ] **Step 5: Visually compare the generated apple-touch-icon against the prior output**

Use the snapshot taken in Task 8 Step 1 (`/tmp/apple-touch-icon-before.png`).

Open both `/tmp/apple-touch-icon-before.png` and the freshly generated
`resources/icons/apple-touch-icon.png` side by side (e.g. in an image viewer or
via the Read tool) and confirm the gradient, glyph, and specular highlights still
match — the color pipeline changed (no more P3 round-trip through `icon.json`),
so this is the check that the 97.3% pixel-match calibration didn't regress.

- [ ] **Step 6: Confirm no stray generated files remain tracked**

Run: `git status --porcelain`
Expected: clean — only intentional commits from this plan, no modified/untracked
icon files (they're gitignored and regenerated on each run)
