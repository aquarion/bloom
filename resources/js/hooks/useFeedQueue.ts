import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedResponse, Post } from "@/types/post";

const REFILL_THRESHOLD = 5;

export function useFeedQueue({
	initialPosts,
	initialCursor,
}: {
	initialPosts: Post[];
	initialCursor: string | null;
}) {
	const [queue, setQueue] = useState<Post[]>(initialPosts.slice(1));
	const [current, setCurrent] = useState<Post | null>(initialPosts[0] ?? null);
	const [cursor, setCursor] = useState<string | null>(initialCursor);
	const fetching = useRef(false);

	const fetchMore = useCallback(async (activeCursor: string) => {
		if (fetching.current) return;
		fetching.current = true;
		try {
			const { data } = await axios.get<FeedResponse>("/feed", {
				params: { cursor: activeCursor },
				headers: { Accept: "application/json" },
			});
			setQueue((q) => [...q, ...data.posts]);
			setCursor(data.next_cursor);
		} finally {
			fetching.current = false;
		}
	}, []);

	useEffect(() => {
		if (queue.length <= REFILL_THRESHOLD && cursor) {
			fetchMore(cursor);
		}
	}, [queue.length, cursor, fetchMore]);

	const advance = useCallback(() => {
		setQueue((q) => {
			setCurrent(q[0] ?? null);
			return q.slice(1);
		});
	}, []);

	return { current, queue, advance };
}
