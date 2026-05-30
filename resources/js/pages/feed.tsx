import { Head, Link } from "@inertiajs/react";
import { gsap } from "gsap";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Attribution } from "@/components/feed/Attribution";
import { PostBackground } from "@/components/feed/PostBackground";
import { PostContent } from "@/components/feed/PostContent";
import { ProgressBar } from "@/components/feed/ProgressBar";
import { SourceBadge } from "@/components/feed/SourceBadge";
import { useAutoAdvance } from "@/hooks/useAutoAdvance";
import { useFeedQueue } from "@/hooks/useFeedQueue";
import { registerFeedDebug, setupDebugWindow } from "@/lib/debug";
import type { Post } from "@/types/post";

export default function Feed({
	initialPosts,
	initialCursor,
	debugEnabled,
}: {
	initialPosts: Post[];
	initialCursor: string | null;
	debugEnabled: boolean;
}) {
	const { current, advance, queue } = useFeedQueue({
		initialPosts,
		initialCursor,
	});
	const [paused, setPaused] = useState(false);
	const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
	const animationReady = readyForPostId === current?.id;
	const bgRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	// Stores the timestamp when the transition is expected to finish; prevents
	// double-firing and self-heals if GSAP ever fails to fire onComplete.
	const transitionEndRef = useRef(0);

	useEffect(() => {
		if (debugEnabled) {
			(window as any).__APP_DEBUG = true;
			setupDebugWindow();
		}
	}, [debugEnabled]);

	useEffect(() => {
		registerFeedDebug({
			current,
			queue,
			cursor: initialCursor,
		});
	}, [current, queue, initialCursor]);

	const handleAdvance = useCallback(() => {
		const bg = bgRef.current;
		const content = contentRef.current;

		if (!bg || !content || Date.now() < transitionEndRef.current) {
			return;
		}

		transitionEndRef.current = Date.now() + 700;

		gsap
			.timeline()
			.to(bg, { opacity: 0, duration: 0.4, ease: "power2.inOut" }, 0)
			.to(
				content,
				{
					scale: 1.3,
					filter: "blur(8px)",
					opacity: 0,
					duration: 0.3,
					ease: "power2.in",
				},
				0,
			)
			.call(
				() => {
					flushSync(() => advance());
					gsap.set(bg, { opacity: 1 });
				},
				undefined,
				0.3,
			)
			.fromTo(
				content,
				{ scale: 0.7, filter: "blur(8px)", opacity: 0 },
				{
					scale: 1,
					filter: "blur(0px)",
					opacity: 1,
					duration: 0.3,
					ease: "power2.out",
				},
				0.3,
			);
	}, [advance]);

	const { progress } = useAutoAdvance({
		duration: 8000,
		paused: paused || !animationReady,
		onAdvance: handleAdvance,
	});

	if (!current) {
		return (
			<div className="flex h-screen items-center justify-center bg-black text-white">
				<p className="text-sm opacity-50">
					No posts — connect an account in Settings.
				</p>
			</div>
		);
	}

	const nextPost = queue[0] ?? current;

	return (
		<>
			<Head title="Feed" />
			<div className="relative h-screen w-screen overflow-hidden bg-black">
				{/* Background layer: bottom slot pre-renders next post's background */}
				<div className="absolute inset-0 z-0">
					<PostBackground post={nextPost} />
					<div ref={bgRef} className="absolute inset-0 bg-black">
						<PostBackground post={current} />
					</div>
				</div>

				{/* Content layer: zoom/blur transition */}
				<div ref={contentRef} className="absolute inset-0 z-10">
					<PostContent
						post={current}
						onReady={() => setReadyForPostId(current.id)}
					/>
				</div>

				{/* Chrome layer: never transitions */}
				<div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
					<div className="pointer-events-auto flex items-center gap-2 p-4">
						<Link
							href="/dashboard"
							className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
							aria-label="Dashboard"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								className="h-4 w-4"
								aria-hidden="true"
							>
								<path
									fillRule="evenodd"
									d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
									clipRule="evenodd"
								/>
							</svg>
						</Link>
						<SourceBadge post={current} />
					</div>

					<div className="flex-1" />

					<div className="pointer-events-auto flex items-center gap-2 px-4 pb-3 pt-2">
						<Attribution post={current} />
						<button
							type="button"
							onClick={() => setPaused((p) => !p)}
							className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
							aria-label={paused ? "Resume" : "Pause"}
						>
							{paused ? (
								<Play className="h-4 w-4" />
							) : (
								<Pause className="h-4 w-4" />
							)}
						</button>
					</div>

					<ProgressBar progress={progress} />
				</div>
			</div>
		</>
	);
}
