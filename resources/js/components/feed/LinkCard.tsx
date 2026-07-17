import { useState } from 'react';
import { getPanelClass } from './panel-class';

const FAVICON_404_KEY = 'bloom:favicon404s:v1';
const favicon404s: Set<string> = (() => {
    try {
        return new Set<string>(
            JSON.parse(localStorage.getItem(FAVICON_404_KEY) ?? '[]'),
        );
    } catch {
        return new Set<string>();
    }
})();

function markFavicon404(url: string) {
    favicon404s.add(url);
    localStorage.setItem(FAVICON_404_KEY, JSON.stringify([...favicon404s]));
}

export function LinkCard({
    url,
    title,
    favicon,
    fullWidth = false,
}: {
    url: string;
    title: string | null;
    favicon: string | null;
    fullWidth?: boolean;
}) {
    const [faviconFailed, setFaviconFailed] = useState(false);
    let hostname = url;

    try {
        hostname = new URL(url).hostname;
    } catch {
        /* keep raw */
    }

    const showFavicon = favicon && !favicon404s.has(favicon) && !faviconFailed;
    const panelClass = getPanelClass({ fullWidth });

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${panelClass} hover:bg-white/20`}
        >
            <div className="flex items-center gap-3">
                {showFavicon && (
                    <img
                        src={favicon}
                        alt=""
                        className="h-5 w-5 flex-shrink-0 rounded"
                        onError={() => {
                            markFavicon404(favicon);
                            setFaviconFailed(true);
                        }}
                    />
                )}
                <div className="min-w-0 flex-1">
                    {title && (
                        <p className="truncate font-semibold text-white/90">
                            {title}
                        </p>
                    )}
                    <p className="truncate text-white/50 text-xs">{hostname}</p>
                </div>
            </div>
        </a>
    );
}
