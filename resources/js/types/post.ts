export interface MediaAttachment {
    type: 'image' | 'video';
    url: string;
    preview_url: string | null;
    alt_text: string | null;
}

export interface ReplyTo {
    author_name: string;
    author_handle: string;
    author_avatar: string;
    original_url: string;
    body: string;
    created_at: string | null;
}

export interface QuotedPost {
    author_name: string;
    author_handle: string;
    author_avatar: string;
    original_url: string;
    body: string;
    created_at: string | null;
}

export interface Post {
    id: string;
    source: 'mastodon' | 'bluesky';
    source_handle: string;
    author_name: string;
    author_handle: string;
    author_avatar: string;
    author_banner: string | null;
    body: string;
    media: MediaAttachment[];
    created_at: string;
    original_url: string;
    link_url: string | null;
    link_title: string | null;
    link_favicon: string | null;
    reply_to: ReplyTo | null;
    quoted_post: QuotedPost | null;
    boosted_by: string | null;
    boosted_by_avatar: string | null;
    boosted_by_handle: string | null;
    boosted_by_created_at: string | null;
    emojis: Record<string, string>;
}

export interface FeedResponse {
    posts: Post[];
    next_cursor: string | null;
}
