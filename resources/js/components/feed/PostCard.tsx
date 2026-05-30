import { Link } from "@inertiajs/react";
import { Pause, Play } from "lucide-react";
import { postColors } from "@/lib/post-colors";
import type { Post } from "@/types/post";
import { Attribution } from "./Attribution";
import { MediaBackground } from "./MediaBackground";
import { PostAnimator } from "./PostAnimator";
import { ProgressBar } from "./ProgressBar";
import { SourceBadge } from "./SourceBadge";

export function PostCard({
	post,
	progress,
	paused,
	onTogglePause,
	onReady,
}: {
	post: Post;
	progress: number;
	paused: boolean;
	onTogglePause: () => void;
	onReady?: () => void;
}) {
	const hasMedia = post.media.length > 0;
	const hasBanner = !hasMedia && !!post.author_banner;
	const colors = hasMedia || hasBanner ? null : postColors(post.author_handle);

	return (
		<div
			className="relative flex h-full w-full flex-col overflow-hidden bg-black"
			style={colors ? { backgroundColor: colors.background } : undefined}
		>
			{hasMedia && <MediaBackground media={post.media} />}
			{hasBanner && (
				<div className="pointer-events-none absolute inset-0 z-0">
					<img
						src={post.author_banner!}
						alt=""
						className="h-full w-full object-cover"
						style={{
							opacity: 0.9,
							filter: "blur(24px)",
							transform: "scale(1.1)",
						}}
					/>
				</div>
			)}

			<div className="relative z-10 flex flex-1 flex-col p-4">
				<div className="flex items-center gap-2">
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
					<SourceBadge post={post} />
				</div>
				<div className="flex flex-1 items-center justify-center">
					<PostAnimator post={post} colors={colors} onReady={onReady} />
				</div>
			</div>

			<div className="relative z-10 flex items-center gap-2 px-4 pb-3 pt-2">
				<Attribution post={post} />
				<button
					type="button"
					onClick={onTogglePause}
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
	);
}
