import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Quote, Reply } from 'lucide-react';
import type React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pickTemplate, SplitText } from '@/lib/animations';
import type { AnimationTemplate } from '@/lib/animations/types';
import { splitIntoLinesWithBoundaries } from '@/lib/block-text';
import { EmojiText } from '@/lib/emoji-text';
import type { PostColors } from '@/lib/post-colors';
import { postColors } from '@/lib/post-colors';
import type { Mention, Post } from '@/types/post';
import { AuthorChip } from './AuthorChip';
import { MentionChips } from './MentionChips';

gsap.registerPlugin(SplitText);

const lastTemplate = { current: undefined as AnimationTemplate | undefined };
const BASE_FONT_SIZE = 40;
const LINE_HEIGHT = 1.1;
const PANEL_CLASS =
    'max-w-[40ch] rounded border border-white/20 bg-black/40 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm';

function ContextPanel({
    icon,
    author_name,
    author_avatar,
    author_handle,
    emojis,
    body,
    original_url,
    chip_mentions,
}: {
    icon: React.ReactNode;
    author_name: string;
    author_avatar: string;
    author_handle: string;
    emojis: Record<string, string>;
    body: string;
    original_url: string;
    chip_mentions: Mention[];
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
                <div className="mt-2">
                    {/* ContextPanel is narrow (max-w-[40ch]) — cap visible chips so a heavily-mentioned reply/quote doesn't blow out the panel width. */}
                    <MentionChips mentions={chip_mentions} maxVisible={2} />
                </div>
            )}
        </>
    );

    if (original_url) {
        return (
            <a
                href={original_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${PANEL_CLASS} hover:bg-white/20`}
            >
                {content}
            </a>
        );
    }

    return <div className={PANEL_CLASS}>{content}</div>;
}

const FAVICON_404_KEY = 'bloom:favicon404s';
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

function LinkCard({
    url,
    title,
    favicon,
}: {
    url: string;
    title: string | null;
    favicon: string | null;
}) {
    const [faviconFailed, setFaviconFailed] = useState(false);
    let hostname = url;

    try {
        hostname = new URL(url).hostname;
    } catch {
        /* keep raw */
    }

    const showFavicon = favicon && !favicon404s.has(favicon) && !faviconFailed;

    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${PANEL_CLASS} hover:bg-white/20`}
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

export function PostAnimator({
    post,
    colors,
    onReady,
    blurMedia = false,
    onRevealMedia,
}: {
    post: Post;
    colors: PostColors | null;
    onReady?: () => void;
    blurMedia?: boolean;
    onRevealMedia?: () => void;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const panelsRef = useRef<HTMLDivElement>(null);
    const onReadyRef = useRef(onReady);
    const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
    // Tracks which body the font sizes were computed for so they naturally
    // become null when body changes without needing setState inside an effect.
    const [fontSizeState, setFontSizeState] = useState<{
        body: string;
        sizes: number[];
    } | null>(null);

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
    });

    const paragraphs = useMemo(
        () =>
            (post.body || post.media[0]?.alt_text || '')
                .split('\n')
                .map((p) => p.trim())
                .filter(Boolean),
        [post.body, post.media],
    );
    const body = paragraphs.join('\n');

    const { lines, paragraphStarts } = useMemo(
        () =>
            body
                ? splitIntoLinesWithBoundaries(body)
                : { lines: [] as string[], paragraphStarts: new Set<number>() },
        [body],
    );

    // Pre-compute a unique key per line using sequential character offsets so
    // identical lines in different positions still get distinct keys.
    const lineKeys = useMemo(() => {
        const keys: number[] = [];
        let search = 0;

        for (const line of lines) {
            const pos = body.indexOf(line, search);
            const key = pos >= 0 ? pos : search;
            keys.push(key);
            search = key + line.length;
        }

        return keys;
    }, [lines, body]);

    // Font sizes are only valid for the current body; treat as null when body changes.
    const fontSizes = fontSizeState?.body === body ? fontSizeState.sizes : null;

    // Fire onReady immediately only when there is no body AND no panels to animate.
    useLayoutEffect(() => {
        if (!body && !(post.reply_to || post.quoted_post)) {
            onReadyRef.current?.();
        }
    }, [body, post.reply_to, post.quoted_post]);

    // Phase 2: measure rendered line widths and compute font sizes
    useLayoutEffect(() => {
        if (lines.length === 0 || !containerRef.current) {
            return;
        }

        const els = lineRefs.current.slice(0, lines.length);

        if (els.some((el) => !el)) {
            return;
        }

        const { width, height } = containerRef.current.getBoundingClientRect();
        const targetWidth = width * 0.9;

        const widths = els.map((el) => el?.getBoundingClientRect().width ?? 0);
        let sizes = widths.map((w) =>
            w > 0 ? BASE_FONT_SIZE * (targetWidth / w) : BASE_FONT_SIZE,
        );

        // For multi-paragraph posts, limit cross-paragraph size disparity while
        // preserving within-paragraph variation (each line still fills its width).
        // Strategy: find each paragraph's min size (its widest line = most constrained),
        // then scale down any paragraph whose min exceeds 2× the global paragraph min.
        if (paragraphStarts.size > 0) {
            const boundaries = [
                0,
                ...[...paragraphStarts].sort((a, b) => a - b),
                sizes.length,
            ];
            const paraMins = boundaries
                .slice(0, -1)
                .map((start, i) =>
                    Math.min(...sizes.slice(start, boundaries[i + 1])),
                );
            const globalMin = Math.min(...paraMins);
            sizes = sizes.map((s, lineIdx) => {
                const p = boundaries.findLastIndex((b) => lineIdx >= b);

                return s * Math.min(1, (globalMin * 2) / paraMins[p]);
            });
        }

        const gapHeight = [...paragraphStarts].reduce(
            (sum, idx) => sum + (sizes[idx] ?? 0) * 0.5,
            0,
        );
        const totalHeight =
            sizes.reduce((sum, s) => sum + s * LINE_HEIGHT, 0) + gapHeight;
        const heightBudget = height * 0.45;

        if (totalHeight > heightBudget) {
            const scale = heightBudget / totalHeight;
            sizes = sizes.map((s) => s * scale);
        }

        setFontSizeState({ body, sizes });
    }, [lines, body, paragraphStarts]);

    // Phase 3: run GSAP animation once font sizes are applied
    useGSAP(() => {
        if (!fontSizes) {
            return;
        }

        const container = containerRef.current;
        const textEl = textRef.current;

        if (!container || !textEl) {
            onReadyRef.current?.();

            return;
        }

        gsap.set(container, { clearProps: 'all' });

        const split = new SplitText(textEl, { type: 'words' });

        if (split.words.length === 0) {
            onReadyRef.current?.();

            return;
        }

        // Apply highlight colour to the longest content word — must happen after SplitText
        // rewrites the DOM, as it strips any inline colour spans.
        // Exclude @mentions and #hashtags (which are stripped from body but may appear
        // in posts that haven't been re-fetched since the hashtag-strip was deployed).
        const highlight =
            colors?.highlight ?? postColors(post.author_handle).highlight;
        const contentWords = [...split.words].filter(
            (w) => !/^[@#]/.test(w.textContent ?? ''),
        );
        const wordPool =
            contentWords.length > 0 ? contentWords : [...split.words];
        const longestEl = wordPool.reduce((a, b) =>
            (a.textContent?.length ?? 0) >= (b.textContent?.length ?? 0)
                ? a
                : b,
        );
        gsap.set(longestEl, { color: highlight });

        const template = pickTemplate(lastTemplate.current);
        lastTemplate.current = template;

        const tl = gsap.timeline({ onComplete: () => onReadyRef.current?.() });
        template(tl, split.words as Element[], container);

        if (panelsRef.current) {
            tl.fromTo(
                panelsRef.current,
                { opacity: 0, y: -8 },
                { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
                0,
            );
        }

        return () => {
            tl.kill();
            split.revert();
        };
    }, [post.id, fontSizes]);

    // Fade panels in for no-body posts that have context panels (Phase 3 doesn't run for these).
    useGSAP(() => {
        if (body || !(post.reply_to || post.quoted_post)) {
            return;
        }

        if (!panelsRef.current) {
            onReadyRef.current?.();

            return;
        }

        const tween = gsap.fromTo(
            panelsRef.current,
            { opacity: 0, y: -8 },
            {
                opacity: 1,
                y: 0,
                duration: 0.4,
                ease: 'power2.out',
                onComplete: () => onReadyRef.current?.(),
            },
        );

        return () => tween.kill();
    }, [post.id, body]);

    if (!body) {
        const firstMedia = post.media[0];

        if (firstMedia) {
            const displaySrc =
                firstMedia.type === 'video'
                    ? firstMedia.preview_url
                    : firstMedia.url;

            if (displaySrc) {
                return (
                    <div className="relative flex h-full w-full items-center justify-center p-4">
                        <img
                            src={displaySrc}
                            alt={firstMedia.alt_text ?? ''}
                            className={`max-h-full max-w-full rounded object-contain transition-all duration-300 ${blurMedia ? 'blur-xl' : ''}`}
                        />
                        {blurMedia && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <button
                                    type="button"
                                    onClick={onRevealMedia}
                                    className="rounded-full bg-black/60 px-4 py-1.5 text-sm text-white hover:bg-black/80"
                                >
                                    Show sensitive media
                                </button>
                            </div>
                        )}
                    </div>
                );
            }
        }

        if (post.link_url || post.quoted_post || post.reply_to) {
            return (
                <div className="flex h-full w-full items-center justify-center p-8">
                    <div
                        ref={panelsRef}
                        className="flex flex-col items-center gap-4"
                    >
                        {post.reply_to && (
                            <ContextPanel
                                icon={<Reply className="size-3.5" />}
                                author_name={post.reply_to.author_name}
                                author_avatar={post.reply_to.author_avatar}
                                author_handle={post.reply_to.author_handle}
                                emojis={post.emojis}
                                body={post.reply_to.body}
                                original_url={post.reply_to.original_url}
                                chip_mentions={post.reply_to.chip_mentions}
                            />
                        )}
                        {post.quoted_post && (
                            <ContextPanel
                                icon={<Quote className="size-3.5" />}
                                author_name={post.quoted_post.author_name}
                                author_avatar={post.quoted_post.author_avatar}
                                author_handle={post.quoted_post.author_handle}
                                emojis={post.emojis}
                                body={post.quoted_post.body}
                                original_url={post.quoted_post.original_url}
                                chip_mentions={post.quoted_post.chip_mentions}
                            />
                        )}
                        {post.link_url && (
                            <LinkCard
                                url={post.link_url}
                                title={post.link_title}
                                favicon={post.link_favicon}
                            />
                        )}
                    </div>
                </div>
            );
        }

        return null;
    }

    const textColor = colors?.text ?? 'white';

    return (
        <div
            ref={containerRef}
            className="flex h-full w-full items-center justify-center p-8 text-center"
        >
            <div className="relative flex flex-col items-center gap-4">
                {(post.reply_to || post.quoted_post) && (
                    <div ref={panelsRef} className="flex flex-col gap-4">
                        {post.reply_to && (
                            <ContextPanel
                                icon={<Reply className="size-3.5" />}
                                author_name={post.reply_to.author_name}
                                author_avatar={post.reply_to.author_avatar}
                                author_handle={post.reply_to.author_handle}
                                emojis={post.emojis}
                                body={post.reply_to.body}
                                original_url={post.reply_to.original_url}
                                chip_mentions={post.reply_to.chip_mentions}
                            />
                        )}
                        {post.quoted_post && (
                            <ContextPanel
                                icon={<Quote className="size-3.5" />}
                                author_name={post.quoted_post.author_name}
                                author_avatar={post.quoted_post.author_avatar}
                                author_handle={post.quoted_post.author_handle}
                                emojis={post.emojis}
                                body={post.quoted_post.body}
                                original_url={post.quoted_post.original_url}
                                chip_mentions={post.quoted_post.chip_mentions}
                            />
                        )}
                    </div>
                )}
                <div
                    key={post.id}
                    ref={textRef}
                    className={`w-full font-extrabold leading-none tracking-tight${post.reply_to || post.quoted_post ? 'min-w-[40ch]' : ''}`}
                    style={{
                        visibility: fontSizes ? 'visible' : 'hidden',
                        color: textColor,
                    }}
                >
                    {lines.map((line, idx) => (
                        <div
                            key={lineKeys[idx]}
                            style={{
                                fontSize: fontSizes
                                    ? `${fontSizes[idx]}px`
                                    : `${BASE_FONT_SIZE}px`,
                                whiteSpace: 'nowrap',
                                ...(paragraphStarts.has(idx) && {
                                    marginTop: '0.5em',
                                }),
                            }}
                        >
                            <span
                                ref={(el) => {
                                    lineRefs.current[idx] = el;
                                }}
                            >
                                <EmojiText text={line} emojis={post.emojis} />
                            </span>
                        </div>
                    ))}
                </div>
                {post.link_url && (
                    <LinkCard
                        url={post.link_url}
                        title={post.link_title}
                        favicon={post.link_favicon}
                    />
                )}
                {post.hashtags.length > 0 && (
                    <div
                        aria-hidden="true"
                        className="absolute top-0 left-full flex h-full flex-col items-center justify-center gap-1 overflow-hidden pl-3"
                    >
                        {[...new Set(post.hashtags)].map((tag) => (
                            <span
                                key={tag}
                                className="rounded-full bg-white/10 px-1.5 py-1.5 text-sm"
                                style={{
                                    color: textColor,
                                    writingMode: 'vertical-rl',
                                }}
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
