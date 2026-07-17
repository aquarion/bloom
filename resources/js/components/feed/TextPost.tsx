import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Quote, Reply } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { pickTemplate, SplitText } from '@/lib/animations';
import type { AnimationTemplate } from '@/lib/animations/types';
import { EmojiText } from '@/lib/emoji-text';
import type { PostColors } from '@/lib/post-colors';
import { postColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';
import { useAutoFitText } from '@/hooks/useAutoFitText';
import { ContextPanel } from './ContextPanel';
import { LinkCard } from './LinkCard';
import { PollResults } from './PollResults';

gsap.registerPlugin(SplitText);

const lastTemplate = { current: undefined as AnimationTemplate | undefined };
const BASE_FONT_SIZE = 40;

export function TextPost({
    post,
    body,
    colors,
    onReady,
}: {
    post: Post;
    body: string;
    colors: PostColors | null;
    onReady?: () => void;
}) {
    const textRef = useRef<HTMLDivElement>(null);
    const panelsRef = useRef<HTMLDivElement>(null);
    const onReadyRef = useRef(onReady);
    const {
        containerRef,
        lineRefs,
        lines,
        lineKeys,
        paragraphStarts,
        fontSizes,
    } = useAutoFitText(body);

    useLayoutEffect(() => {
        onReadyRef.current = onReady;
    });

    // Animate once per-line font sizes are committed to the DOM
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
                {post.poll && (
                    <PollResults
                        poll={post.poll}
                        originalUrl={post.original_url}
                    />
                )}
                {post.link_url && (
                    <LinkCard
                        url={post.link_url}
                        title={post.link_title}
                        favicon={post.link_favicon}
                    />
                )}
                {post.hashtags.length > 0 && (
                    <div className="absolute top-0 left-full flex h-full flex-col items-center justify-center gap-1 overflow-hidden pl-3">
                        {post.hashtags.map(({ tag, url }) => (
                            <a
                                key={tag}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full bg-white/10 px-1.5 py-1.5 text-sm"
                                style={{
                                    color: textColor,
                                    writingMode: 'vertical-rl',
                                }}
                            >
                                #{tag}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
