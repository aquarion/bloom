import type { Mention } from '@/types/post';
import bloom from '../../../icons/bloom-standard.svg';

export function MentionAvatarChip({ mention }: { mention: Mention }) {
    return (
        <a
            href={mention.profile_url}
            target="_blank"
            rel="noopener noreferrer"
            title={mention.display_name}
            className="shrink-0"
        >
            <img
                src={mention.avatar || bloom}
                alt={mention.display_name}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
            />
        </a>
    );
}
