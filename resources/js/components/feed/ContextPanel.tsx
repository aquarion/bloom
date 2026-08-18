import { AtSign } from 'lucide-react';
import type React from 'react';
import { useCwState } from '@/hooks/useCwState';
import { nestedCwLike, postLevelCwLabel, shouldShowCwOverlay } from '@/lib/cw';
import type { MediaAttachment, Mention } from '@/types/post';
import type { ContentBehavior } from '@/types/preferences';
import { AuthorChip } from './AuthorChip';
import { CwTag } from './CwTag';
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
    media = [],
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
    media?: MediaAttachment[];
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

    // Post-level CWs get a corner badge on the box instead — only an author-level CW
    // decorates the chip here.
    const chip = (
        <AuthorChip
            name={author_name}
            avatar={author_avatar}
            emojis={emojis}
            account={author_handle}
            cwLabel={cw_is_author_level ? cw_text : null}
        />
    );
    const cwTagLabel = postLevelCwLabel({ cw_text, cw_is_author_level });
    // Sensitive media has no reveal mechanism here (unlike the top-level post, which
    // blurs and lets the viewer tap through) — simplest safe behaviour is to just not
    // show a thumbnail for it, rather than leaking it unblurred.
    const thumbnail = sensitive_media ? null : (media[0] ?? null);
    // A video's `url` is the raw video file, not an image — only its preview_url (a
    // static frame) is ever safe to put in an <img>, unlike an image's url/preview_url
    // which are both actual images. Mirrors ImageCarousel's same type-based split.
    const thumbnailSrc = thumbnail
        ? thumbnail.type === 'video'
            ? thumbnail.preview_url || null
            : thumbnail.preview_url || thumbnail.url || null
        : null;
    // Inside the gate, the "Marked as X" / "Labelled as X" copy below already states
    // the label — showing it a second time on the chip badge would be redundant.
    const gatedChip = (
        <AuthorChip
            name={author_name}
            avatar={author_avatar}
            emojis={emojis}
            account={author_handle}
        />
    );

    const content = showCwGate ? (
        <>
            <div className="mb-2 flex items-center gap-1.5">
                <span className="text-white/40">{icon}</span>
                {cw_is_author_level ? (
                    <span className="text-sm text-white/70">This author</span>
                ) : (
                    gatedChip
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
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap">{body}</p>
                    {chip_mentions.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                            <AtSign className="size-4 shrink-0 text-white/30" />
                            <MentionChips mentions={chip_mentions} />
                        </div>
                    )}
                </div>
                {thumbnailSrc && (
                    <img
                        src={thumbnailSrc}
                        alt={thumbnail?.alt_text ?? ''}
                        data-testid="reply-thumbnail"
                        loading="lazy"
                        decoding="async"
                        className="size-14 shrink-0 rounded-lg object-cover"
                    />
                )}
            </div>
            {cwTagLabel && (
                <CwTag
                    label={cwTagLabel}
                    className="absolute right-2 bottom-2"
                />
            )}
        </>
    );

    const panelClass = `${getPanelClass({ fullWidth })} relative`;

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
