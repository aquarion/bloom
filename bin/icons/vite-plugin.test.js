import fs from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateAppleTouchIcon, generateWebIcons } from '@istic-co/annealer';
import { iconGenerationPlugin } from './vite-plugin.js';

vi.mock('node:fs/promises', () => ({
    default: { readFile: vi.fn() },
}));
vi.mock('@istic-co/annealer');

const ICON_CONFIG = {
    glyph: 'resources/branding/noun-bloom-5179258-FFFFFF.svg',
    iconPath: 'resources/branding/bloom.icon',
    backgroundColor: '#6A2AAC',
    backgroundColors: {
        local: '#CC0000',
        staging: '#CC7700',
        production: '#6A2AAC',
    },
};

beforeEach(() => {
    fs.readFile.mockResolvedValue(JSON.stringify(ICON_CONFIG));
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

describe('iconGenerationPlugin', () => {
    it('resolves the background color for the current APP_ENV and generates both icon sets', async () => {
        vi.stubEnv('APP_ENV', 'staging');

        const plugin = iconGenerationPlugin();

        plugin.configResolved({ mode: 'production', command: 'build' });
        await plugin.buildStart();

        expect(generateWebIcons).toHaveBeenCalledWith(
            expect.objectContaining({ backgroundColor: '#CC7700' }),
        );
        expect(generateAppleTouchIcon).toHaveBeenCalledWith(
            expect.objectContaining({ backgroundColor: '#CC7700' }),
            undefined,
            { syncJson: true },
        );
    });

    it('falls back to the Vite mode when APP_ENV is unset', async () => {
        vi.stubEnv('APP_ENV', undefined);

        const plugin = iconGenerationPlugin();

        plugin.configResolved({ mode: 'local', command: 'build' });
        await plugin.buildStart();

        expect(generateWebIcons).toHaveBeenCalledWith(
            expect.objectContaining({ backgroundColor: '#CC0000' }),
        );
    });

    it('falls back to the default backgroundColor for an unmapped mode', async () => {
        vi.stubEnv('APP_ENV', 'development');

        const plugin = iconGenerationPlugin();

        plugin.configResolved({ mode: 'development', command: 'build' });
        await plugin.buildStart();

        expect(generateWebIcons).toHaveBeenCalledWith(
            expect.objectContaining({ backgroundColor: '#6A2AAC' }),
        );
    });

    it('skips syncing icon.json while serving, to avoid working-tree drift', async () => {
        vi.stubEnv('APP_ENV', 'local');

        const plugin = iconGenerationPlugin();

        plugin.configResolved({ mode: 'local', command: 'serve' });
        await plugin.buildStart();

        expect(generateAppleTouchIcon).toHaveBeenCalledWith(expect.anything(), undefined, { syncJson: false });
    });
});
