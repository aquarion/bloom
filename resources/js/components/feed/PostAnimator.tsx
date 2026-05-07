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
		const template = pickTemplate(lastTemplate.current);
		lastTemplate.current = template;

		const tl = gsap.timeline();
		template(tl, split.words as Element[], container);

		return () => {
			split.revert();
			tl.kill();
		};
	}, [post.id]);

	return (
		<div
			ref={containerRef}
			className="flex h-full w-full items-center justify-center p-8 text-center"
		>
			<div
				ref={textRef}
				className="text-2xl font-extrabold leading-tight tracking-tight text-white"
			>
				{post.body}
			</div>
		</div>
	);
}
