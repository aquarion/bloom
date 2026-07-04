export interface MediaAttachment {
    type: 'image' | 'video';
    url: string;
    preview_url: string | null;
    alt_text: string | null;
}

export interface Mention {
    handle: string;
    display_name: string;
    avatar: string;
    profile_url: string;
}

export interface ReplyTo {
    author_name: string;
    author_handle: string;
    author_avatar: string;
    original_url: string;
    body: string;
    created_at: string | null;
    chip_mentions: Mention[];
}

export interface QuotedPost {
    author_name: string;
    author_handle: string;
    author_avatar: string;
    original_url: string;
    body: string;
    created_at: string | null;
    chip_mentions: Mention[];
}

export interface Post {
    id: string;
    source: 'mastodon' | 'bluesky';
    source_handle: string | null;
    source_instance: string | null;
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
    /** Normalised hashtags: lowercase, no leading '#', deduplicated. e.g. ["rust", "programming"] */
    hashtags: string[];
    /** Mentions classified as incidental — stripped from `body`, shown as chips. Empty if none, or if disabled for this viewer. */
    chip_mentions: Mention[];
    cw_text: string | null;
    cw_is_author_level: boolean;
    cw_label_source: 'self' | 'external' | null;
    sensitive_media: boolean;
}

export interface FeedResponse {
    posts: Post[];
    next_cursor: string | null;
}
