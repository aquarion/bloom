import { AtSign } from 'lucide-react';
import type React from 'react';
import { useCwState } from '@/hooks/useCwState';
import { nestedCwLike, shouldShowCwOverlay } from '@/lib/cw';
import type { Mention } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';
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
    cw_text = null,
    cw_is_author_level = false,
    cw_label_source = null,
    sensitive_media = false,
    cwBehavior = 'show',
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
    cw_text?: string | null;
    cw_is_author_level?: boolean;
    cw_label_source?: 'self' | 'external' | null;
    sensitive_media?: boolean;
    cwBehavior?: ContentBehavior;
}) {
    const { isRevealed, reveal } = useCwState();

    const cwPost = nestedCwLike({
        original_url,
        author_handle,
        cw_text,
        cw_is_author_level,
        sensitive_media,
    });
    const showCwGate = shouldShowCwOverlay(
        cwPost,
        cwBehavior,
        'show',
        isRevealed,
    );

    const chip = (
        <AuthorChip
            name={author_name}
            avatar={author_avatar}
            emojis={emojis}
            account={author_handle}
            cwLabel={cw_text}
        />
    );

    const content = showCwGate ? (
        <>
            <div className="mb-2 flex items-center gap-1.5">
                <span className="text-white/40">{icon}</span>
                {cw_is_author_level ? (
                    <span className="text-sm text-white/70">This author</span>
                ) : (
                    chip
                )}
            </div>
            <p className="text-sm text-white/70">
                {cw_label_source === 'external'
                    ? `Labelled as ${(cw_text ?? '').toLowerCase()}`
                    : `Marked as ${(cw_text ?? '').toLowerCase()}`}
            </p>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    reveal(cwPost);
                }}
                className="mt-2 rounded-full bg-white/20 px-3 py-1 text-xs hover:bg-white/30"
            >
                {cw_is_author_level ? 'Show author' : 'Show anyway'}
            </button>
        </>
    ) : (
        <>
            <div className="mb-2 flex items-center gap-1.5">
                <span className="text-white/40">{icon}</span>
                {chip}
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

    if (showCwGate) {
        return <div className={panelClass}>{content}</div>;
    }

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
