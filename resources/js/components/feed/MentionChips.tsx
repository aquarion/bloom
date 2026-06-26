import type { Mention } from '@/types/post';
import { AuthorChip } from './AuthorChip';

function dedupeByProfileUrl(mentions: Mention[]): Mention[] {
    const seen = new Map<string, Mention>();

    for (const mention of mentions) {
        if (!seen.has(mention.profile_url)) {
            seen.set(mention.profile_url, mention);
        }
    }

    return [...seen.values()];
}

export function MentionChips({
    mentions,
    maxVisible,
}: {
    mentions: Mention[];
    /** Caps the number of rendered chips, showing a "+N more" badge for the rest. Unset = show all (no cap). */
    maxVisible?: number;
}) {
    const uniqueMentions = dedupeByProfileUrl(mentions);

    if (uniqueMentions.length === 0) {
        return null;
    }

    const visibleMentions =
        maxVisible !== undefined
            ? uniqueMentions.slice(0, maxVisible)
            : uniqueMentions;
    const hiddenCount = uniqueMentions.length - visibleMentions.length;

    return (
        <div className="flex flex-wrap items-center gap-2">
            {visibleMentions.map((mention) => (
                <a
                    key={mention.profile_url}
                    href={mention.profile_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-[12rem]"
                >
                    <AuthorChip
                        name={mention.display_name}
                        avatar={mention.avatar}
                        emojis={{}}
                        account={mention.handle}
                    />
                </a>
            ))}
            {hiddenCount > 0 && (
                <span className="flex-shrink-0 rounded-full bg-white/10 px-2 py-1 text-white/50 text-xs">
                    +{hiddenCount} more
                </span>
            )}
        </div>
    );
}
