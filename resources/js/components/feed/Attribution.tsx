import type { Post } from "@/types/post";

function timeSince(dateStr: string): string {
	const seconds = Math.floor(
		(Date.now() - new Date(dateStr).getTime()) / 1000,
	);

	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function Attribution({ post }: { post: Post }) {
	return (
		<a
			href={post.original_url}
			target="_blank"
			rel="noopener noreferrer"
			className="flex min-w-0 flex-1 items-center gap-2 text-left"
		>
			<img
				src={post.author_avatar}
				alt={post.author_name}
				className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs font-bold text-white">
					{post.author_name}
				</p>
				<p className="truncate text-[0.65rem] text-white/50">
					{post.boosted_by
						? `${post.source === "mastodon" ? "Boosted" : "Reposted"} by ${post.boosted_by} · `
						: ""}
					Posted {timeSince(post.created_at)} · tap to open ↗
				</p>
			</div>
		</a>
	);
}
