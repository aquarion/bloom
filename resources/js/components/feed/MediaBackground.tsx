import type { MediaAttachment } from "@/types/post";

export function MediaBackground({ media }: { media: MediaAttachment[] }) {
	const first = media[0];

	if (!first) {
return null;
}

	const src = first.type === "video" ? first.preview_url : first.url;

	return (
		<div className="pointer-events-none absolute inset-0 z-0">
			<img
				src={src}
				alt=""
				className="h-full w-full object-cover"
				style={{ opacity: 0.4 }}
			/>
		</div>
	);
}
