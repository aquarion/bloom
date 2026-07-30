import { TriangleAlert } from 'lucide-react';

/** Red "CW: label" pill for a post-level content warning — shown alongside a post's
 * hashtags, or as a corner badge on a reply/quote box. See postLevelCwLabel (lib/cw)
 * for when this applies as opposed to AuthorChip's author-level marker. */
export function CwTag({
    label,
    className = '',
}: {
    label: string;
    className?: string;
}) {
    return (
        <span
            data-testid="post-cw-tag"
            className={`inline-flex items-center gap-1 rounded-full border border-red-900 bg-red-950/40 px-2 py-1 text-red-400 text-xs ${className}`}
        >
            <TriangleAlert className="size-3 shrink-0" />
            CW: {label}
        </span>
    );
}
