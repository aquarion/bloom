import { EmojiText } from '@/lib/emoji-text';
import bloom from '../../../icons/bloom-standard.svg';

export function AuthorChip({
    name,
    avatar,
    emojis,
    account,
    time,
    absoluteTime,
    cwLabel,
}: {
    name: string;
    avatar: string;
    emojis: Record<string, string>;
    account: string;
    time?: string;
    absoluteTime?: string;
    /** Content-warning label this author/post carries. Renders a persistent marker so
     * accepting the warning doesn't erase all trace that the post was ever flagged. */
    cwLabel?: string | null;
}) {
    return (
        <div
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-full py-1 pr-3 pl-1 ${
                cwLabel ? 'border border-red-900 bg-red-950/40' : 'bg-white/10'
            }`}
        >
            <img
                src={avatar || bloom}
                alt={name}
                className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-white text-xs leading-tight">
                    <EmojiText text={name} emojis={emojis} />
                    {cwLabel && (
                        <span className="ml-1.5 font-normal text-red-400">
                            ⚠️ {cwLabel}
                        </span>
                    )}
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
