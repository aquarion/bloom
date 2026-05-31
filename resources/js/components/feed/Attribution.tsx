import { Quote, Repeat2 } from "lucide-react";
import type { Post } from "@/types/post";
import { AuthorChip } from "./AuthorChip";

function timeSince(dateStr: string): string {
	const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

	if (seconds < 60) {
		return "just now";
	}

	const minutes = Math.floor(seconds / 60);

	if (minutes < 60) {
		return `${minutes}m ago`;
	}

	const hours = Math.floor(minutes / 60);

	if (hours < 24) {
		return `${hours}h ago`;
	}

	const days = Math.floor(hours / 24);

	return `${days}d ago`;
}

export function Attribution({ post }: { post: Post }) {
	if (post.quoted_post) {
		return (
			<div className="flex min-w-0 flex-1 items-center gap-2 text-left">
				{post.quoted_post.original_url ? (
					<a
						href={post.quoted_post.original_url}
						target="_blank"
						rel="noopener noreferrer"
						className="flex min-w-0 items-center gap-2"
					>
						<AuthorChip
							name={post.quoted_post.author_name}
							avatar={post.quoted_post.author_avatar}
							emojis={post.emojis}
							account={post.quoted_post.author_handle}
							time={
								post.quoted_post.created_at
									? timeSince(post.quoted_post.created_at)
									: undefined
							}
						/>
					</a>
				) : (
					<div className="flex min-w-0 items-center gap-2">
						<AuthorChip
							name={post.quoted_post.author_name}
							avatar={post.quoted_post.author_avatar}
							emojis={post.emojis}
							account={post.quoted_post.author_handle}
							time={
								post.quoted_post.created_at
									? timeSince(post.quoted_post.created_at)
									: undefined
							}
						/>
					</div>
				)}
				<Quote className="size-4 flex-shrink-0 text-white/30" />
				<a
					href={post.original_url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex min-w-0 items-center gap-2"
				>
					<AuthorChip
						name={post.author_name}
						avatar={post.author_avatar}
						emojis={post.emojis}
						account={post.author_handle}
						time={timeSince(post.created_at)}
					/>
				</a>
			</div>
		);
	}

	if (post.boosted_by) {
		const label = (
			<Repeat2
				className="size-4 flex-shrink-0"
				role="img"
				aria-label={post.source === "mastodon" ? "Boosted" : "Reposted"}
			/>
		);

		return (
			<div className="flex min-w-0 flex-1 items-center gap-2 text-left">
				<a
					href={post.original_url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex min-w-0 items-center gap-2"
				>
					<AuthorChip
						name={post.author_name}
						avatar={post.author_avatar}
						emojis={post.emojis}
						account={post.author_handle}
						time={timeSince(post.created_at)}
					/>
				</a>
				<span className="flex-shrink-0 text-white/30">{label}</span>
				<div className="flex min-w-0 items-center gap-2">
					<AuthorChip
						name={post.boosted_by}
						avatar={post.boosted_by_avatar ?? ""}
						emojis={post.emojis}
						account={post.boosted_by_handle ?? ""}
						time={
							post.boosted_by_created_at
								? timeSince(post.boosted_by_created_at)
								: undefined
						}
					/>
				</div>
			</div>
		);
	}

	return (
		<a
			href={post.original_url}
			target="_blank"
			rel="noopener noreferrer"
			className="flex min-w-0 items-center gap-2 text-left"
		>
			<AuthorChip
				name={post.author_name}
				avatar={post.author_avatar}
				emojis={post.emojis}
				account={post.author_handle}
				time={timeSince(post.created_at)}
			/>
		</a>
	);
}
