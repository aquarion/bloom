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

export interface PollOption {
    readonly title: string;
    /** Null if per-option vote counts are hidden until the poll closes. */
    readonly votes_count: number | null;
}

export interface HashtagLink {
    readonly tag: string;
    /** Derived from `tag` server-side (PostNormalizer::hashtagUrl) — not independently settable. */
    readonly url: string;
}

export interface Poll {
    readonly id: string;
    readonly expires_at: string | null;
    readonly expired: boolean;
    readonly multiple: boolean;
    readonly votes_count: number;
    readonly options: readonly PollOption[];
    readonly voted: boolean;
    readonly own_votes: readonly number[];
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
    /** Normalised hashtags: lowercase, no leading '#', deduplicated, with a precomputed provider link. */
    hashtags: HashtagLink[];
    /** Mentions classified as incidental — stripped from `body`, shown as chips. Empty if none, or if disabled for this viewer. */
    chip_mentions: Mention[];
    cw_text: string | null;
    cw_is_author_level: boolean;
    /** Who applied the content warning. 'self' = author labelled their own content; 'external' = third-party labeller (Bluesky only); null = no CW (cw_text is also null). */
    cw_label_source: 'self' | 'external' | null;
    sensitive_media: boolean;
    /** Absent on Bluesky posts (no poll concept). Explicit null on a Mastodon post with no poll. */
    poll?: Poll | null;
}

export interface FeedResponse {
    posts: Post[];
    next_cursor: string | null;
}
