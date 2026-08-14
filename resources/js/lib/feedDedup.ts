import type { Post } from '@/types/post';

// Client-side port of app/Services/Feed/FeedAggregator.php's dedupe() pipeline.
// The backend now fetches each account independently (see FeedAccountController),
// so cross-account de-duplication — exact URL match plus fuzzy content-similarity —
// has to happen here. Accounts resolve one at a time rather than all at once
// (see useFeedQueue), so dedupeAgainstHistory() below checks each incoming batch
// against everything already shown or queued, not just its own batch.

// Matches config/feed.php's buffer_size default — a memory ceiling, not a diversity
// floor. Callers on a page with access to that config value should pass it through
// (see feed.tsx); this is only the fallback for callers that don't.
const DEFAULT_BUFFER_SIZE = 200;
const SIMILARITY_WINDOW_SECONDS = 86400;
const SIMILARITY_THRESHOLD_PERCENT = 80;
const MIN_BODY_LENGTH_FOR_SIMILARITY_CHECK = 30;

export function normaliseBodyForDedup(body: string): string {
    let text = body.toLowerCase();
    text = text.replace(/https?:\/\/\S+/gu, '');
    text = text.replace(/#[\p{L}\p{N}_]+/gu, '');
    text = text.replace(/[^\p{L}\p{N}\s]/gu, '');

    return text.replace(/\s+/gu, ' ').trim();
}

// Port of PHP's similar_text() longest-common-substring algorithm (php_similar_str),
// used with the same 80% threshold the backend applied before the fetch was split
// per-account.
function similarChars(a: string, b: string): number {
    let max = 0;
    let posA = 0;
    let posB = 0;

    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            let k = 0;

            while (
                i + k < a.length &&
                j + k < b.length &&
                a[i + k] === b[j + k]
            ) {
                k++;
            }

            if (k > max) {
                max = k;
                posA = i;
                posB = j;
            }
        }
    }

    if (max === 0) {
        return 0;
    }

    let sum = max;

    if (posA > 0 && posB > 0) {
        sum += similarChars(a.slice(0, posA), b.slice(0, posB));
    }

    if (posA + max < a.length && posB + max < b.length) {
        sum += similarChars(a.slice(posA + max), b.slice(posB + max));
    }

    return sum;
}

export function similarTextPercent(a: string, b: string): number {
    if (a.length === 0 && b.length === 0) {
        return 0;
    }

    return ((similarChars(a, b) * 2) / (a.length + b.length)) * 100;
}

type DedupContext = {
    seenKeys: Set<string>;
    // [normalised body, unix seconds] for every post already accepted whose
    // body cleared MIN_BODY_LENGTH_FOR_SIMILARITY_CHECK.
    seenBodies: Array<[string, number]>;
};

function isDuplicateBody(
    normBody: string,
    postTimeSeconds: number,
    seenBodies: Array<[string, number]>,
): boolean {
    for (const [existingBody, existingTime] of seenBodies) {
        if (
            Math.abs(postTimeSeconds - existingTime) > SIMILARITY_WINDOW_SECONDS
        ) {
            continue;
        }

        // similar_text()'s score is at most 2*min(lenA,lenB)/(lenA+lenB) —
        // skip the O(n*m) comparison outright when that ceiling can't reach
        // the threshold (exact bound, not a heuristic: avoids the expensive
        // path for the large majority of non-duplicate pairs).
        const maxPossiblePercent =
            ((2 * Math.min(normBody.length, existingBody.length)) /
                (normBody.length + existingBody.length)) *
            100;

        if (maxPossiblePercent < SIMILARITY_THRESHOLD_PERCENT) {
            continue;
        }

        if (
            similarTextPercent(normBody, existingBody) >=
            SIMILARITY_THRESHOLD_PERCENT
        ) {
            return true;
        }
    }

    return false;
}

// Seeds a dedup context from posts already accepted elsewhere (e.g. a
// caller's running history), so a later dedupeAgainstContext() call catches
// duplicates against that history, not just within its own posts array.
function buildDedupContext(existingPosts: Post[]): DedupContext {
    const context: DedupContext = { seenKeys: new Set(), seenBodies: [] };

    for (const post of existingPosts) {
        context.seenKeys.add(post.original_url || post.id);

        const normBody = normaliseBodyForDedup(post.body ?? '');

        if (normBody.length < MIN_BODY_LENGTH_FOR_SIMILARITY_CHECK) {
            continue;
        }

        // An unparseable created_at gets time 0 rather than being skipped —
        // matching dedupeAgainstContext's handling of the same case below,
        // so a bad timestamp doesn't make a post invisible to the fuzzy
        // pass on one side but not the other.
        const postTime = Date.parse(post.created_at);

        context.seenBodies.push([
            normBody,
            Number.isNaN(postTime) ? 0 : postTime / 1000,
        ]);
    }

    return context;
}

// Sorts `posts` newest-first and filters out anything matching `context`
// (exact original_url/id, or fuzzy body similarity within the time window),
// mutating `context` with whatever it accepts so a later call sees these too.
function dedupeAgainstContext(posts: Post[], context: DedupContext): Post[] {
    const sorted = posts.toSorted((a, b) =>
        b.created_at.localeCompare(a.created_at),
    );

    const deduped: Post[] = [];

    for (const post of sorted) {
        const key = post.original_url || post.id;

        if (context.seenKeys.has(key)) {
            continue;
        }

        context.seenKeys.add(key);

        const normBody = normaliseBodyForDedup(post.body ?? '');

        if (normBody.length >= MIN_BODY_LENGTH_FOR_SIMILARITY_CHECK) {
            const postTime = Date.parse(post.created_at);

            if (Number.isNaN(postTime)) {
                context.seenBodies.push([normBody, 0]);
                deduped.push(post);
                continue;
            }

            const postTimeSeconds = postTime / 1000;

            if (
                isDuplicateBody(normBody, postTimeSeconds, context.seenBodies)
            ) {
                continue;
            }

            context.seenBodies.push([normBody, postTimeSeconds]);
        }

        deduped.push(post);
    }

    return deduped;
}

/**
 * Merge and de-duplicate posts pooled from several accounts' independent fetches:
 * exact match on original_url (or id, for posts without one — keeps the newest of
 * a repeated boost) plus a fuzzy content-similarity pass that catches the same
 * story/boost reposted from two different connected accounts within a day of
 * each other. Sorted newest-first, capped to bufferSize.
 */
export function dedupePosts(
    posts: Post[],
    bufferSize: number = DEFAULT_BUFFER_SIZE,
): Post[] {
    return dedupeAgainstHistory(posts, [], bufferSize);
}

/**
 * Like dedupePosts, but also checks `incoming` against posts already present
 * in `history` — for deduping one batch at a time (e.g. as each connected
 * account's fetch resolves) against everything shown or queued so far,
 * instead of requiring every account's response up front to dedup correctly.
 */
export function dedupeAgainstHistory(
    incoming: Post[],
    history: Post[],
    bufferSize: number = DEFAULT_BUFFER_SIZE,
): Post[] {
    const context = buildDedupContext(history);

    return dedupeAgainstContext(incoming, context).slice(0, bufferSize);
}
