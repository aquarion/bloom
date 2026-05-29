import type { ReactNode } from "react";
import { EmojiText } from "@/lib/emoji-text";
import sprouter from "../../../icons/sprouter-standard.svg";

export function AuthorChip({
	name,
	avatar,
	emojis,
	subtext,
}: {
	name: string;
	avatar: string;
	emojis: Record<string, string>;
	subtext?: ReactNode;
}) {
	return (
		<div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 pl-1 pr-3">
			<img
				src={avatar || sprouter}
				alt={name}
				className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs font-bold text-white">
					<EmojiText text={name} emojis={emojis} />
				</p>
				{subtext !== undefined && (
					<p className="truncate text-[0.65rem] text-white/50">{subtext}</p>
				)}
			</div>
		</div>
	);
}
