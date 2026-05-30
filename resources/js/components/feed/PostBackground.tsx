import { postColors } from "@/lib/post-colors";
import type { Post } from "@/types/post";
import { MediaBackground } from "./MediaBackground";

export function PostBackground({ post }: { post: Post }) {
	const hasMedia = post.media.length > 0;
	const hasBanner = !hasMedia && !!post.author_banner;
	const colors = hasMedia || hasBanner ? null : postColors(post.author_handle);

	return (
		<div
			className="absolute inset-0"
			style={colors ? { backgroundColor: colors.background } : undefined}
		>
			{hasMedia && <MediaBackground media={post.media} />}
			{hasBanner && (
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
			)}
		</div>
	);
}
