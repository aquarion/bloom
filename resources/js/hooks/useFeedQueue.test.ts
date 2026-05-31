import { router } from "@inertiajs/react";
import { act, renderHook } from "@testing-library/react";
import axios from "axios";
import { expect, it, vi } from "vitest";
import type { Post } from "@/types/post";
import { useFeedQueue } from "./useFeedQueue";

vi.mock("axios");
vi.mock("@inertiajs/react", () => ({
	router: {
		visit: vi.fn(),
	},
}));

const makePost = (id: string): Post => ({
	id,
	source: "mastodon",
	source_handle: "",
	author_name: "Test",
	author_handle: "@test@example.com",
	author_avatar: "",
	author_banner: null,
	body: "hello",
	media: [],
	created_at: new Date().toISOString(),
	original_url: "https://example.com",
	link_url: null,
	link_title: null,
	link_favicon: null,
	reply_to: null,
	quoted_post: null,
	boosted_by: null,
	boosted_by_avatar: null,
	boosted_by_handle: null,
	boosted_by_created_at: null,
	emojis: {},
});

it("initialises with provided posts", () => {
	const posts = [makePost("1"), makePost("2")];
	const { result } = renderHook(() =>
		useFeedQueue({ initialPosts: posts, initialCursor: null }),
	);
	expect(result.current.current?.id).toBe("1");
	expect(result.current.queue).toHaveLength(1);
});

it("dequeues the head of the queue", () => {
	const posts = [makePost("1"), makePost("2"), makePost("3")];
	const { result } = renderHook(() =>
		useFeedQueue({ initialPosts: posts, initialCursor: null }),
	);
	act(() => result.current.advance());
	expect(result.current.current?.id).toBe("2");
	expect(result.current.queue).toHaveLength(1);
});

it("fetches more posts when queue drops to 5", async () => {
	const posts = Array.from({ length: 6 }, (_, i) => makePost(String(i)));
	const newPosts = [makePost("extra1"), makePost("extra2")];

	vi.mocked(axios.get).mockResolvedValue({
		data: { posts: newPosts, next_cursor: null },
	});

	const { result } = renderHook(() =>
		useFeedQueue({ initialPosts: posts, initialCursor: "cursor123" }),
	);

	await act(async () => result.current.advance());

	expect(axios.get).toHaveBeenCalledWith("/feed", {
		params: { cursor: "cursor123" },
		headers: { Accept: "application/json" },
	});
});

it("redirects to login when feed refill gets unauthenticated", async () => {
	const posts = Array.from({ length: 6 }, (_, i) => makePost(String(i)));

	vi.mocked(axios.isAxiosError).mockReturnValue(true);
	vi.mocked(axios.get).mockRejectedValue({
		isAxiosError: true,
		response: { status: 401 },
	});
	vi.mocked(router.visit).mockClear();

	renderHook(() =>
		useFeedQueue({ initialPosts: posts, initialCursor: "cursor123" }),
	);

	await act(async () => Promise.resolve());

	expect(router.visit).toHaveBeenCalledWith("/login");
});
