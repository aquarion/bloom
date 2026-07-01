import { postDisplayColors } from '@/lib/post-colors';
import type { Post } from '@/types/post';

export function PostBackground({ post }: { post: Post }) {
    const colors = postDisplayColors(post);

    return (
        <div
            className="absolute inset-0 overflow-hidden"
            style={colors ? { backgroundColor: colors.background } : undefined}
        >
            {!post.media.length && post.author_banner && (
                <div className="pointer-events-none absolute inset-0 z-0">
                    <img
                        src={post.author_banner}
                        alt=""
                        className="h-full w-full object-cover"
                        style={{
                            opacity: 0.7,
                            filter: 'blur(24px)',
                            transform: 'scale(1.1)',
                        }}
                    />
                </div>
            )}
        </div>
    );
}
