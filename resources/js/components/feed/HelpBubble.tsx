import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export function HelpBubble({
    open,
    onDismiss,
    children,
}: {
    open: boolean;
    onDismiss: () => void;
    children: ReactNode;
}) {
    if (!open) {
        return null;
    }

    return (
        <div className="pointer-events-auto flex max-w-xs items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-white text-xs shadow-lg backdrop-blur-sm">
            <span>{children}</span>
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss tip"
                className="shrink-0 text-white/60 hover:text-white"
            >
                <X className="size-3.5" />
            </button>
        </div>
    );
}
