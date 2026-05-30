import { postColors } from "@/lib/post-colors";
import type { Post } from "@/types/post";
import { PostAnimator } from "./PostAnimator";

export function PostContent({
	post,
	onReady,
}: {
	post: Post;
	onReady?: () => void;
}) {
	const hasMedia = post.media.length > 0;
	const hasBanner = !hasMedia && !!post.author_banner;
	const colors = hasMedia || hasBanner ? null : postColors(post.author_handle);

	return (
		<div className="flex h-full w-full items-center justify-center">
			<PostAnimator post={post} colors={colors} onReady={onReady} />
		</div>
	);
}
