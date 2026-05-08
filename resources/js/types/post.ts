export interface MediaAttachment {
	type: "image" | "video";
	url: string;
	preview_url: string;
	alt_text: string | null;
}

export interface ReplyTo {
	author_handle: string;
	body: string;
}

export interface QuotedPost {
	author_handle: string;
	body: string;
}

export interface Post {
	id: string;
	source: "mastodon" | "bluesky";
	author_name: string;
	author_handle: string;
	author_avatar: string;
	body: string;
	media: MediaAttachment[];
	created_at: string;
	original_url: string;
	reply_to: ReplyTo | null;
	quoted_post: QuotedPost | null;
	boosted_by: string | null;
}

export interface FeedResponse {
	posts: Post[];
	next_cursor: string | null;
}
