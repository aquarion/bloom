import { EmojiText } from "@/lib/emoji-text";
import { AuthorChip } from "./AuthorChip";
import type { Post } from "@/types/post";

function timeSince(dateStr: string): string {
	const seconds = Math.floor(
		(Date.now() - new Date(dateStr).getTime()) / 1000,
	);

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
						className="flex min-w-0 flex-1 items-center gap-2"
					>
						<AuthorChip
							name={post.quoted_post.author_name}
							avatar={post.quoted_post.author_avatar}
							emojis={post.emojis}
							subtext={post.quoted_post.author_handle}
						/>
					</a>
				) : (
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<AuthorChip
							name={post.quoted_post.author_name}
							avatar={post.quoted_post.author_avatar}
							emojis={post.emojis}
							subtext={post.quoted_post.author_handle}
						/>
					</div>
				)}
				<span className="flex-shrink-0 text-white/30">❝</span>
				<a
					href={post.original_url}
					target="_blank"
					rel="noopener noreferrer"
					className="flex min-w-0 flex-1 items-center gap-2"
				>
					<AuthorChip
						name={post.author_name}
						avatar={post.author_avatar}
						emojis={post.emojis}
						subtext={post.author_handle}
					/>
				</a>
			</div>
		);
	}

	const subtext = (
		<>
			{post.boosted_by && (
				<>
					{post.source === "mastodon" ? "Boosted" : "Reposted"} by{" "}
					<EmojiText text={post.boosted_by} emojis={post.emojis} />
					{" · "}
				</>
			)}
			Posted {timeSince(post.created_at)} · tap to open ↗
		</>
	);

	return (
		<a
			href={post.original_url}
			target="_blank"
			rel="noopener noreferrer"
			className="flex min-w-0 flex-1 items-center gap-2 text-left"
		>
			<AuthorChip
				name={post.author_name}
				avatar={post.author_avatar}
				emojis={post.emojis}
				subtext={subtext}
			/>
		</a>
	);
}
