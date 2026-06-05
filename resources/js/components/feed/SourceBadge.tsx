import { SiBluesky, SiMastodon } from 'react-icons/si';
import type { Post } from '@/types/post';

const ICONS = {
    mastodon: SiMastodon,
    bluesky: SiBluesky,
} as const;

export function SourceBadge({ post }: { post: Post }) {
    const Icon = ICONS[post.source];

    return (
        <div className="flex h-7 items-center gap-1.5 self-start rounded-full bg-white/10 px-2.5 text-xs text-white/60">
            <Icon className="size-3" />
            {post.source_handle}
        </div>
    );
}
