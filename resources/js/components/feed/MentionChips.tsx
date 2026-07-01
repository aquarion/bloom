import { useLayoutEffect, useRef, useState } from 'react';
import { computeChipLayout } from '@/lib/chip-layout';
import type { Mention } from '@/types/post';
import { AuthorChip } from './AuthorChip';
import { MentionAvatarChip } from './MentionAvatarChip';

const AVATAR_WIDTH = 40;
const GAP = 8;
const BADGE_WIDTH = 56;

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
    const mentionKey = uniqueMentions.map((m) => m.profile_url).join(',');

    const [fullWidths, setFullWidths] = useState<number[] | null>(null);
    const [availableWidth, setAvailableWidth] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureRefs = useRef<Record<string, HTMLDivElement | null>>({});

    useLayoutEffect(() => {
        setFullWidths(
            uniqueMentions.map(
                (m) => measureRefs.current[m.profile_url]?.offsetWidth ?? 0,
            ),
        );

        const container = containerRef.current;

        if (!container) {
            return;
        }

        setAvailableWidth(container.getBoundingClientRect().width);

        const observer = new ResizeObserver(([entry]) => {
            setAvailableWidth(entry.contentRect.width);
        });
        observer.observe(container);

        return () => observer.disconnect();
        // mentionKey is a stable proxy for uniqueMentions (a fresh array on
        // every render); depending on the array itself would re-run this
        // effect, and its setState calls, on every single render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mentionKey]);

    if (uniqueMentions.length === 0) {
        return null;
    }

    const { modes, hiddenCount } =
        fullWidths !== null && availableWidth !== null
            ? computeChipLayout({
                  fullWidths,
                  availableWidth,
                  avatarWidth: AVATAR_WIDTH,
                  gap: GAP,
                  badgeWidth: BADGE_WIDTH,
              })
            : {
                  modes: uniqueMentions.map(() => 'full' as const),
                  hiddenCount: 0,
              };

    return (
        <>
            <div
                aria-hidden
                className="invisible absolute top-0 left-[-9999px] flex"
            >
                {uniqueMentions.map((mention) => (
                    <div
                        key={mention.profile_url}
                        data-mention-measure-id={mention.profile_url}
                        ref={(el) => {
                            measureRefs.current[mention.profile_url] = el;
                        }}
                        className="inline-block"
                    >
                        <AuthorChip
                            name={mention.display_name}
                            avatar={mention.avatar}
                            emojis={{}}
                            account={mention.handle}
                        />
                    </div>
                ))}
            </div>
            <div
                ref={containerRef}
                data-testid="mention-chips-visible"
                className="flex min-w-0 flex-1 items-center gap-2"
            >
                {uniqueMentions.slice(0, modes.length).map((mention, index) =>
                    modes[index] === 'full' ? (
                        <a
                            key={mention.profile_url}
                            href={mention.profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="max-w-[12rem] flex-shrink-0"
                        >
                            <AuthorChip
                                name={mention.display_name}
                                avatar={mention.avatar}
                                emojis={{}}
                                account={mention.handle}
                            />
                        </a>
                    ) : (
                        <MentionAvatarChip
                            key={mention.profile_url}
                            mention={mention}
                        />
                    ),
                )}
                {hiddenCount > 0 && (
                    <span className="flex-shrink-0 rounded-full bg-white/10 px-2 py-1 text-white/50 text-xs">
                        +{hiddenCount}
                    </span>
                )}
            </div>
        </>
    );
}
