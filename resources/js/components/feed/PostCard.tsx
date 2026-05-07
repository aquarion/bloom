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
}: {
	post: Post;
	progress: number;
	paused: boolean;
	onTogglePause: () => void;
}) {
	return (
		<div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
			<MediaBackground media={post.media} />

			<div className="relative z-10 flex flex-1 flex-col p-4">
				<SourceBadge post={post} />
				<div className="flex flex-1 items-center justify-center">
					<PostAnimator post={post} />
				</div>
			</div>

			<div className="relative z-10 flex items-center gap-2 px-4 pb-3 pt-2">
				<Attribution post={post} />
				<button
					onClick={onTogglePause}
					className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-lg leading-none"
					aria-label={paused ? "Resume" : "Pause"}
				>
					{paused ? "▶️" : "⏸"}
				</button>
			</div>

			<ProgressBar progress={progress} />
		</div>
	);
}
