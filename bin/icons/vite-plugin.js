/* global process */
import fs from 'node:fs/promises';
import { generateAppleTouchIcon } from './generate-apple-touch-icon.js';
import { generateWebIcons } from './generate-web-icons.js';

const CONFIG_PATH = 'resources/branding/icon-config.json';

export function iconGenerationPlugin() {
    let viteMode;
    let isServe;

    return {
        name: 'bloom-icon-generation',
        configResolved(config) {
            // APP_ENV (local/staging/production) takes precedence over Vite mode so
            // staging servers don't need --mode staging on their build command.
            viteMode = process.env.APP_ENV ?? config.mode;
            isServe = config.command === 'serve';
        },
        async buildStart() {
            const iconConfig = JSON.parse(await fs.readFile(CONFIG_PATH, 'utf-8'));
            const backgroundColor = iconConfig.backgroundColors?.[viteMode] ?? iconConfig.backgroundColor;
            const config = { ...iconConfig, backgroundColor };

            await generateWebIcons(config);
            // Skip syncing icon.json during dev server — it causes constant
            // working-tree drift as Vite restarts with the environment colour.
            await generateAppleTouchIcon(config, undefined, { syncJson: !isServe });
        },
    };
}
