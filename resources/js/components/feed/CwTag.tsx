import { TriangleAlert } from 'lucide-react';

/** Red "CW: label" pill for a post-level content warning — shown alongside a post's
 * hashtags, or as a corner badge on a reply/quote box. See postLevelCwLabel (lib/cw)
 * for when this applies as opposed to AuthorChip's author-level marker. */
export function CwTag({
    label,
    className = '',
    vertical = false,
}: {
    label: string;
    className?: string;
    /** Matches TextPost's vertical hashtag pills (rotated text, no icon) rather than
     * the default horizontal badge — used when the tag sits in that same tag column. */
    vertical?: boolean;
}) {
    return (
        <span
            data-testid="post-cw-tag"
            className={`inline-flex items-center gap-1 rounded-full border border-red-900 bg-red-950/40 text-red-400 ${
                vertical ? 'px-1.5 py-1.5 text-sm' : 'px-2 py-1 text-xs'
            } ${className}`}
            style={vertical ? { writingMode: 'vertical-rl' } : undefined}
        >
            {!vertical && <TriangleAlert className="size-3 shrink-0" />}
            CW: {label}
        </span>
    );
}
