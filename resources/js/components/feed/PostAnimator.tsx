import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useLayoutEffect, useRef } from "react";
import { pickTemplate, SplitText } from "@/lib/animations";
import type { AnimationTemplate } from "@/lib/animations/types";
import type { Post } from "@/types/post";

gsap.registerPlugin(SplitText);

const lastTemplate = { current: undefined as AnimationTemplate | undefined };

export function PostAnimator({
	post,
	onReady,
}: {
	post: Post;
	onReady?: () => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	const onReadyRef = useRef(onReady);

	useLayoutEffect(() => {
		onReadyRef.current = onReady;
	});

	useGSAP(() => {
		const container = containerRef.current;
		const textEl = textRef.current;

		if (!container || !textEl) {
			onReadyRef.current?.();

			return;
		}

		// Clear any transform/filter state left on the container by the previous
		// template so each animation always starts from a clean slate.
		gsap.set(container, { clearProps: "all" });

		const split = new SplitText(textEl, { type: "words" });

		if (split.words.length === 0) {
			onReadyRef.current?.();

			return;
		}

		const template = pickTemplate(lastTemplate.current);
		lastTemplate.current = template;

		const tl = gsap.timeline({ onComplete: () => onReadyRef.current?.() });
		template(tl, split.words as Element[], container);

		// Don't call split.revert() in cleanup — it writes the old innerHTML back
		// into the DOM after React has already committed the new post body, causing
		// the next SplitText to operate on stale content.
		return () => {
			tl.kill();
		};
	}, [post.id]);

	const body = post.body || post.media[0]?.alt_text || "";

	if (!body) {
return null;
}

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full items-center justify-center p-8 text-center"
		>
			<div className="flex flex-col items-center gap-4">
				{post.reply_to && (
					<div className="max-w-[40ch] rounded border border-white/20 bg-white/10 px-4 py-3 text-left text-sm text-white/70 backdrop-blur-sm">
						<p className="mb-1 font-semibold text-white/50">↩ {post.reply_to.author_handle}</p>
						<p className="line-clamp-2">{post.reply_to.body}</p>
					</div>
				)}
				<div
					key={post.id}
					ref={textRef}
					className="mx-auto max-w-[40ch] text-2xl font-extrabold leading-tight tracking-tight text-white"
				>
					{body}
				</div>
			</div>
		</div>
	);
}
