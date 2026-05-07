import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { SplitText, pickTemplate } from "@/lib/animations";
import type { AnimationTemplate } from "@/lib/animations/types";
import type { Post } from "@/types/post";

gsap.registerPlugin(SplitText);

const lastTemplate = { current: undefined as AnimationTemplate | undefined };

export function PostAnimator({ post }: { post: Post }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);

	useGSAP(() => {
		const container = containerRef.current;
		const textEl = textRef.current;
		if (!container || !textEl) return;

		const split = new SplitText(textEl, { type: "words" });
		if (split.words.length === 0) return;

		const template = pickTemplate(lastTemplate.current);
		lastTemplate.current = template;

		const tl = gsap.timeline();
		template(tl, split.words as Element[], container);

		// Don't call split.revert() in cleanup — it writes the old innerHTML back
		// into the DOM after React has already committed the new post body, causing
		// the next SplitText to operate on stale content.
		return () => { tl.kill(); };
	}, [post.id]);

	const body = post.body || post.media[0]?.alt_text || "";

	if (!body) return null;

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full items-center justify-center p-8 text-center"
		>
			<div
				key={post.id}
				ref={textRef}
				className="mx-auto max-w-[40ch] text-2xl font-extrabold leading-tight tracking-tight text-white"
			>
				{body}
			</div>
		</div>
	);
}
