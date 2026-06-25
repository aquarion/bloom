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

export function MentionChips({ mentions }: { mentions: Mention[] }) {
    const uniqueMentions = dedupeByProfileUrl(mentions);

    if (uniqueMentions.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {uniqueMentions.map((mention) => (
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
        </div>
    );
}
