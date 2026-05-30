import { Head } from "@inertiajs/react";
import { gsap } from "gsap";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PostCard } from "@/components/feed/PostCard";
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
	const currentRef = useRef<HTMLDivElement>(null);
	// Stores the timestamp when the transition is expected to finish; prevents
	// double-firing and self-heals if GSAP ever fails to fire onComplete.
	const transitionEndRef = useRef(0);

	// Initialize debug utilities (only if APP_DEBUG is enabled)
	useEffect(() => {
		if (debugEnabled) {
			(window as any).__APP_DEBUG = true;
			setupDebugWindow();
		}
	}, [debugEnabled]);

	// Register feed state with debug utilities whenever it changes
	useEffect(() => {
		registerFeedDebug({
			current,
			queue,
			cursor: initialCursor,
		});
	}, [current, queue, initialCursor]);

	const handleAdvance = useCallback(() => {
		const el = currentRef.current;

		if (!el || Date.now() < transitionEndRef.current) {
			return;
		}

		transitionEndRef.current = Date.now() + 700;

		gsap
			.timeline()
			.to(el, {
				scale: 1.3,
				filter: "blur(8px)",
				opacity: 0,
				duration: 0.3,
				ease: "power2.in",
			})
			.call(() => flushSync(() => advance()))
			.fromTo(
				el,
				{ scale: 0.7, filter: "blur(8px)", opacity: 0 },
				{
					scale: 1,
					filter: "blur(0px)",
					opacity: 1,
					duration: 0.3,
					ease: "power2.out",
				},
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

	return (
		<>
			<Head title="Feed" />
			<div className="h-screen w-screen overflow-hidden bg-black">
				<div ref={currentRef} className="h-full w-full">
					<PostCard
						key={current.id}
						post={current}
						progress={progress}
						paused={paused}
						onTogglePause={() => setPaused((p) => !p)}
						onReady={() => setReadyForPostId(current.id)}
					/>
				</div>
			</div>
		</>
	);
}
