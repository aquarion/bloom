import { AtSign } from 'lucide-react';
import type React from 'react';
import type { Mention } from '@/types/post';
import { AuthorChip } from './AuthorChip';
import { MentionChips } from './MentionChips';
import { getPanelClass } from './panel-class';

export function ContextPanel({
    icon,
    author_name,
    author_avatar,
    author_handle,
    emojis,
    body,
    original_url,
    chip_mentions,
    fullWidth = false,
}: {
    icon: React.ReactNode;
    author_name: string;
    author_avatar: string;
    author_handle: string;
    emojis: Record<string, string>;
    body: string;
    original_url: string;
    chip_mentions: Mention[];
    fullWidth?: boolean;
}) {
    const content = (
        <>
            <div className="mb-2 flex items-center gap-1.5">
                <span className="text-white/40">{icon}</span>
                <AuthorChip
                    name={author_name}
                    avatar={author_avatar}
                    emojis={emojis}
                    account={author_handle}
                />
            </div>
            <p className="whitespace-pre-wrap">{body}</p>
            {chip_mentions.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                    <AtSign className="size-4 flex-shrink-0 text-white/30" />
                    <MentionChips mentions={chip_mentions} />
                </div>
            )}
        </>
    );

    const panelClass = getPanelClass({ fullWidth });

    if (original_url) {
        return (
            <a
                href={original_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${panelClass} hover:bg-white/20`}
            >
                {content}
            </a>
        );
    }

    return <div className={panelClass}>{content}</div>;
}
