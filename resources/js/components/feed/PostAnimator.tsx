import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useLayoutEffect, useRef, useState } from "react";
import { pickTemplate, SplitText } from "@/lib/animations";
import type { AnimationTemplate } from "@/lib/animations/types";
import { splitIntoLines } from "@/lib/block-text";
import { postColors, type PostColors } from "@/lib/post-colors";
import type { Post } from "@/types/post";

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
	const [lines, setLines] = useState<string[]>([]);
	const [fontSizes, setFontSizes] = useState<number[] | null>(null);

	useLayoutEffect(() => {
		onReadyRef.current = onReady;
	});

	const paragraphs = (post.body || post.media[0]?.alt_text || "")
		.split("\n")
		.map((p) => p.trim())
		.filter(Boolean);
	const body = paragraphs.join(" ");

	// Phase 1: split text into lines when body changes
	useLayoutEffect(() => {
		if (!body) {
			// Media-only post (e.g. a GIF with no caption/alt text): nothing to
			// animate, but onReady must still fire so the auto-advance timer starts.
			onReadyRef.current?.();
			return;
		}
		const newLines = splitIntoLines(body);
		lineRefs.current = new Array(newLines.length).fill(null);
		setLines(newLines);
		setFontSizes(null);
	}, [body]);

	// Phase 2: measure rendered line widths and compute font sizes
	useLayoutEffect(() => {
		if (lines.length === 0 || !containerRef.current) return;

		const els = lineRefs.current.slice(0, lines.length);
		if (els.some((el) => !el)) return;

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

		setFontSizes(sizes);
	}, [lines]);

	// Phase 3: run GSAP animation once font sizes are applied
	useGSAP(() => {
		if (!fontSizes) return;

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
		if (!firstMedia) return null;

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
					<div className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm">
						<p className="mb-1 font-semibold text-white/50">
							↩ {post.reply_to.author_handle}
						</p>
						<p className="line-clamp-2">{post.reply_to.body}</p>
					</div>
				)}
				{post.quoted_post && (
					<div className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm">
						<p className="mb-1 font-semibold text-white/50">
							❝ {post.quoted_post.author_handle}
						</p>
						<p className="line-clamp-2">{post.quoted_post.body}</p>
					</div>
				)}
				<div
					key={post.id}
					ref={textRef}
					className="w-full font-extrabold leading-none tracking-tight"
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
									{line}
								</span>
							</div>
						);
					})}
			</div>
			{post.link_url && (() => {
				let hostname = post.link_url;
				try { hostname = new URL(post.link_url).hostname; } catch { /* keep raw */ }
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
