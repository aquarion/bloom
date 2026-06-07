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
    it(
        'renders a 1024x1024 RGBA PNG',
        async () => {
            outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bloom-apple-icon-'));

            await generateAppleTouchIcon(CONFIG, outputDir);

            const { width, height, channels } = await sharp(path.join(outputDir, 'apple-touch-icon.png')).metadata();

            expect({ width, height, channels }).toEqual({ width: 1024, height: 1024, channels: 4 });
        },
        20000,
    );

    it(
        "syncs icon.json's automatic-gradient to the compensated brand color",
        async () => {
            outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bloom-apple-icon-'));

            await generateAppleTouchIcon(CONFIG, outputDir);

            const iconData = JSON.parse(await fs.readFile(ICON_JSON_PATH, 'utf-8'));

            expect(iconData.fill['automatic-gradient']).toBe(hexToDisplayP3(compensateForAppleRender(CONFIG.backgroundColor)));
        },
        20000,
    );
});
