import { EmojiText } from "@/lib/emoji-text";
import sprouter from "../../../icons/sprouter-standard.svg";

export function AuthorChip({
	name,
	avatar,
	emojis,
	account,
	time,
}: {
	name: string;
	avatar: string;
	emojis: Record<string, string>;
	account: string;
	time?: string;
}) {
	return (
		<div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3">
			<img
				src={avatar || sprouter}
				alt={name}
				className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
			/>
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs font-bold leading-tight text-white">
					<EmojiText text={name} emojis={emojis} />
				</p>
				<p className="truncate text-[0.65rem] leading-tight text-white/50">
					{account}
				</p>
				{time !== undefined && (
					<p className="truncate text-[0.65rem] leading-tight text-white/40">
						{time}
					</p>
				)}
			</div>
		</div>
	);
}
