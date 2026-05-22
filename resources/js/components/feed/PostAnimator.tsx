import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { pickTemplate, SplitText } from "@/lib/animations";
import type { AnimationTemplate } from "@/lib/animations/types";
import { splitIntoLines } from "@/lib/block-text";
import { EmojiText } from "@/lib/emoji-text";
import { postColors } from "@/lib/post-colors";
import type { PostColors } from "@/lib/post-colors";
import type { Post } from "@/types/post";
import { AuthorChip } from "./AuthorChip";

gsap.registerPlugin(SplitText);

const lastTemplate = { current: undefined as AnimationTemplate | undefined };
const BASE_FONT_SIZE = 40;
const LINE_HEIGHT = 1.1;

export function PostAnimator({
	post,
	colors,
	onReady,
}: {
	post: Post;
	colors: PostColors | null;
	onReady?: () => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	const onReadyRef = useRef(onReady);
	const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
	// Tracks which body the font sizes were computed for so they naturally
	// become null when body changes without needing setState inside an effect.
	const [fontSizeState, setFontSizeState] = useState<{ body: string; sizes: number[] } | null>(null);

	useLayoutEffect(() => {
		onReadyRef.current = onReady;
	});

	const paragraphs = (post.body || post.media[0]?.alt_text || "")
		.split("\n")
		.map((p) => p.trim())
		.filter(Boolean);
	const body = paragraphs.join(" ");

	// Derive lines synchronously — splitIntoLines is pure, no DOM access needed.
	const lines = useMemo(() => (body ? splitIntoLines(body) : []), [body]);

	// Font sizes are only valid for the current body; treat as null when body changes.
	const fontSizes = fontSizeState?.body === body ? fontSizeState.sizes : null;

	// Fire onReady immediately for media-only posts (no text to animate).
	useLayoutEffect(() => {
		if (!body) {
			onReadyRef.current?.();
		}
	}, [body]);

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

		let sizes = els.map((el) => {
			const w = el?.getBoundingClientRect().width ?? 0;

			return w > 0 ? BASE_FONT_SIZE * (targetWidth / w) : BASE_FONT_SIZE;
		});

		const totalHeight = sizes.reduce((sum, s) => sum + s * LINE_HEIGHT, 0);
		const heightBudget = height * 0.45;

		if (totalHeight > heightBudget) {
			const scale = heightBudget / totalHeight;
			sizes = sizes.map((s) => s * scale);
		}

		setFontSizeState({ body, sizes });
	}, [lines, body]);

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

		gsap.set(container, { clearProps: "all" });

		const split = new SplitText(textEl, { type: "words" });

		if (split.words.length === 0) {
			onReadyRef.current?.();

			return;
		}

		// Apply highlight colour to the longest word — must happen after SplitText
		// rewrites the DOM, as it strips any inline colour spans.
		const highlight = colors?.highlight ?? postColors(post.author_handle).highlight;
		const longestEl = [...split.words].reduce((a, b) =>
			(b.textContent?.length ?? 0) > (a.textContent?.length ?? 0) ? b : a,
		);
		gsap.set(longestEl, { color: highlight });

		const template = pickTemplate(lastTemplate.current);
		lastTemplate.current = template;

		const tl = gsap.timeline({ onComplete: () => onReadyRef.current?.() });
		template(tl, split.words as Element[], container);

		return () => {
			tl.kill();
			split.revert();
		};
	}, [post.id, fontSizes]);

	if (!body) {
		const firstMedia = post.media[0];

		if (!firstMedia) {
			return null;
		}

		return (
			<div className="flex h-full w-full items-center justify-center p-4">
				<img
					src={firstMedia.url}
					alt={firstMedia.alt_text ?? ""}
					className="max-h-full max-w-full rounded object-contain"
				/>
			</div>
		);
	}

	const textColor = colors?.text ?? "white";

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full items-center justify-center p-8 text-center"
		>
			<div className="flex flex-col items-center gap-4">
				{post.reply_to && (
					post.reply_to.original_url ? (
						<a
							href={post.reply_to.original_url}
							target="_blank"
							rel="noopener noreferrer"
							className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm hover:bg-white/20"
						>
							<div className="mb-2 flex items-center gap-1.5">
								<span className="text-white/40">↩</span>
								<AuthorChip
									name={post.reply_to.author_name}
									avatar={post.reply_to.author_avatar}
									emojis={post.emojis}
									subtext={post.reply_to.author_handle}
								/>
							</div>
							<p className="line-clamp-3">{post.reply_to.body}</p>
						</a>
					) : (
						<div className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm">
							<div className="mb-2 flex items-center gap-1.5">
								<span className="text-white/40">↩</span>
								<AuthorChip
									name={post.reply_to.author_name}
									avatar={post.reply_to.author_avatar}
									emojis={post.emojis}
									subtext={post.reply_to.author_handle}
								/>
							</div>
							<p className="line-clamp-3">{post.reply_to.body}</p>
						</div>
					)
				)}
				{post.quoted_post && (
					post.quoted_post.original_url ? (
						<a
							href={post.quoted_post.original_url}
							target="_blank"
							rel="noopener noreferrer"
							className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm hover:bg-white/20"
						>
							<div className="mb-2 flex items-center gap-1.5">
								<span className="text-white/40">❝</span>
								<AuthorChip
									name={post.quoted_post.author_name}
									avatar={post.quoted_post.author_avatar}
									emojis={post.emojis}
									subtext={post.quoted_post.author_handle}
								/>
							</div>
							<p className="line-clamp-3">{post.quoted_post.body}</p>
						</a>
					) : (
						<div className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm">
							<div className="mb-2 flex items-center gap-1.5">
								<span className="text-white/40">❝</span>
								<AuthorChip
									name={post.quoted_post.author_name}
									avatar={post.quoted_post.author_avatar}
									emojis={post.emojis}
									subtext={post.quoted_post.author_handle}
								/>
							</div>
							<p className="line-clamp-3">{post.quoted_post.body}</p>
						</div>
					)
				)}
				<div
					key={post.id}
					ref={textRef}
					className={`w-full font-extrabold leading-none tracking-tight${post.reply_to || post.quoted_post ? " min-w-[40ch]" : ""}`}
					style={{ visibility: fontSizes ? "visible" : "hidden", color: textColor }}
				>
					{lines.map((line) => {
						const charOffset = body.indexOf(line);

						return (
							<div
								key={charOffset}
								style={{
									fontSize: fontSizes
										? `${fontSizes[lines.indexOf(line)]}px`
										: `${BASE_FONT_SIZE}px`,
									whiteSpace: "nowrap",
								}}
							>
								<span
									ref={(el) => {
										lineRefs.current[lines.indexOf(line)] = el;
									}}
								>
									<EmojiText text={line} emojis={post.emojis} />
								</span>
							</div>
						);
					})}
				</div>
				{post.link_url && (() => {
					let hostname = post.link_url;

					try {
						hostname = new URL(post.link_url).hostname;
					} catch { /* keep raw */ }

					return (
						<a
							href={post.link_url}
							target="_blank"
							rel="noopener noreferrer"
							className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm hover:bg-white/20"
						>
							<div className="flex items-center gap-3">
								{post.link_favicon && (
									<img
										src={post.link_favicon}
										alt=""
										className="h-5 w-5 flex-shrink-0 rounded"
									/>
								)}
								<div className="flex-1 min-w-0">
									{post.link_title && (
										<p className="font-semibold text-white/90 truncate">{post.link_title}</p>
									)}
									<p className="text-xs text-white/50 truncate">{hostname}</p>
								</div>
							</div>
						</a>
					);
				})()}
			</div>
		</div>
	);
}
