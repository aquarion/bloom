import { SiBluesky, SiMastodon } from 'react-icons/si';
import type { Post } from '@/types/post';

const ICONS = {
    mastodon: SiMastodon,
    bluesky: SiBluesky,
} as const;

const PROVIDER_LABELS = {
    mastodon: 'Mastodon',
    bluesky: 'Bluesky',
} as const;

export function SourceBadge({ post }: { post: Post }) {
    const Icon = ICONS[post.source];
    const isPublicFeed = post.feed_type && post.feed_type !== 'home';
    const label = isPublicFeed
        ? [PROVIDER_LABELS[post.source], post.feed_name]
              .filter(Boolean)
              .join(' — ')
        : post.source_handle;

    return (
        <div className="flex h-7 items-center gap-1.5 self-start rounded-full bg-white/10 px-2.5 text-white/60 text-xs">
            <Icon className="size-3" />
            {label}
        </div>
    );
}
