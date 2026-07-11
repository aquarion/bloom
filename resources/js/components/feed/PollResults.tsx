import { Check } from 'lucide-react';
import type { Poll } from '@/types/post';
import { timeSince } from './Attribution';
import { PANEL_CLASS } from './PostAnimator';

function pollStatus(poll: Poll): string {
    if (poll.expired) {
        return 'Poll closed';
    }

    if (!poll.expires_at) {
        return 'Poll open';
    }

    return `Closes ${timeSince(poll.expires_at)}`;
}

export function PollResults({
    poll,
    originalUrl,
}: {
    poll: Poll;
    originalUrl: string;
}) {
    const total = poll.votes_count;

    return (
        <div className={PANEL_CLASS}>
            <div className="mb-2 flex items-center justify-between gap-2 text-white/50 text-xs">
                <span>{pollStatus(poll)}</span>
                {poll.multiple && <span>Multiple choice</span>}
            </div>
            <div className="flex flex-col gap-2">
                {poll.options.map((option, index) => {
                    const votesHidden = option.votes_count === null;
                    const votes = option.votes_count ?? 0;
                    const pct =
                        !votesHidden && total > 0
                            ? Math.round((votes / total) * 100)
                            : 0;
                    const isOwnVote =
                        poll.voted && poll.own_votes.includes(index);

                    return (
                        <div
                            key={index}
                            data-testid={`poll-option-${index}`}
                            data-voted={isOwnVote}
                            className={`relative overflow-hidden rounded border px-2 py-1.5 ${
                                isOwnVote
                                    ? 'border-white/60'
                                    : 'border-white/20'
                            }`}
                        >
                            {!votesHidden && (
                                <div
                                    className="absolute inset-y-0 left-0 bg-white/15"
                                    style={{ width: `${pct}%` }}
                                />
                            )}
                            <div className="relative flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5">
                                    {isOwnVote && (
                                        <Check className="size-3.5 flex-shrink-0" />
                                    )}
                                    {option.title}
                                </span>
                                <span className="flex-shrink-0 text-white/50">
                                    {votesHidden
                                        ? 'votes hidden'
                                        : `${votes} votes (${pct}%)`}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-white/50 text-xs">
                    {total} votes total
                </span>
                <a
                    href={originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/80 text-xs underline hover:text-white"
                >
                    Vote →
                </a>
            </div>
        </div>
    );
}
