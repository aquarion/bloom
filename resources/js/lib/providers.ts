import { SiBluesky, SiMastodon } from 'react-icons/si';

export type Provider = 'mastodon' | 'bluesky';

export const PROVIDER_ICONS = {
    mastodon: SiMastodon,
    bluesky: SiBluesky,
} as const;
