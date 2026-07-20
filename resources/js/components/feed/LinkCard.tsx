import { Play } from 'lucide-react';
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
    description,
    image,
    favicon,
    youtubeId = null,
    fullWidth = false,
}: {
    url: string;
    title: string | null;
    description: string | null;
    image: string | null;
    favicon: string | null;
    youtubeId?: string | null;
    fullWidth?: boolean;
}) {
    const [faviconFailed, setFaviconFailed] = useState(false);
    const [thumbnailFailed, setThumbnailFailed] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    let hostname = url;

    try {
        hostname = new URL(url).hostname;
    } catch {
        /* keep raw */
    }

    const showFavicon = favicon && !favicon404s.has(favicon) && !faviconFailed;

    if (youtubeId && !thumbnailFailed) {
        const panelClass = getPanelClass({ fullWidth, noPadding: true });

        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={title ? `${title} (YouTube video)` : 'YouTube video'}
                className={`${panelClass} block overflow-hidden hover:bg-white/20`}
            >
                <div className="relative aspect-video w-full bg-black/60">
                    <img
                        src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => setThumbnailFailed(true)}
                    />
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70">
                            <Play className="ml-0.5 h-6 w-6 fill-white text-white" />
                        </div>
                    </div>
                </div>
                {title && (
                    <p className="truncate px-4 py-3 font-semibold text-white/90">
                        {title}
                    </p>
                )}
            </a>
        );
    }

    if (image && !imageFailed) {
        const panelClass = getPanelClass({ fullWidth, noPadding: true });

        return (
            <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${panelClass} block overflow-hidden hover:bg-white/20`}
            >
                <img
                    src={image}
                    alt=""
                    className="aspect-video w-full object-cover"
                    onError={() => setImageFailed(true)}
                />
                <div className="flex items-center gap-3 px-4 py-3">
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
                        {description && (
                            <p className="line-clamp-2 text-white/60 text-xs">
                                {description}
                            </p>
                        )}
                        <p className="truncate text-white/50 text-xs">
                            {hostname}
                        </p>
                    </div>
                </div>
            </a>
        );
    }

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
                    {description && (
                        <p className="line-clamp-2 text-white/60 text-xs">
                            {description}
                        </p>
                    )}
                    <p className="truncate text-white/50 text-xs">{hostname}</p>
                </div>
            </div>
        </a>
    );
}
