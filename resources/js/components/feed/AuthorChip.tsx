import { EmojiText } from '@/lib/emoji-text';
import bloom from '../../../icons/bloom-standard.svg';

export function AuthorChip({
    name,
    avatar,
    emojis,
    account,
    time,
    absoluteTime,
}: {
    name: string;
    avatar: string;
    emojis: Record<string, string>;
    account: string;
    time?: string;
    absoluteTime?: string;
}) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 py-1 pr-3 pl-1">
            <img
                src={avatar || bloom}
                alt={name}
                className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-white text-xs leading-tight">
                    <EmojiText text={name} emojis={emojis} />
                </p>
                <p className="truncate text-[0.65rem] text-white/50 leading-tight">
                    {account}
                </p>
                {time !== undefined && (
                    <p
                        className="truncate text-[0.65rem] text-white/40 leading-tight"
                        title={absoluteTime}
                    >
                        {time}
                    </p>
                )}
            </div>
        </div>
    );
}
