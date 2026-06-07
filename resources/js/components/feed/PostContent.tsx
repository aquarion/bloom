import { postDisplayColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';
import { PostAnimator } from './PostAnimator';

export function PostContent({
    post,
    onReady,
}: {
    post: Post;
    onReady?: () => void;
}) {
    const colors = postDisplayColors(post);

    return (
        <div className="flex h-full w-full items-center justify-center">
            <PostAnimator post={post} colors={colors} onReady={onReady} />
        </div>
    );
}
