import type { Mention } from '@/types/post';
import { AuthorChip } from './AuthorChip';

export function MentionChips({ mentions }: { mentions: Mention[] }) {
    if (mentions.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            {mentions.map((mention) => (
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
