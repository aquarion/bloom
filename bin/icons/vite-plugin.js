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
