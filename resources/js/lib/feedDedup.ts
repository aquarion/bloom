import type { Post } from '@/types/post';

// Client-side port of app/Services/Feed/FeedAggregator.php's dedupe() pipeline.
// The backend now fetches each account independently (see FeedAccountController),
// so cross-account de-duplication — exact URL match plus fuzzy content-similarity —
// has to happen here after the per-account responses are merged. Scoped to a single
// merge batch, matching the backend: not persisted across pagination.

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
    const sorted = posts.toSorted((a, b) =>
        b.created_at.localeCompare(a.created_at),
    );

    const seen = new Set<string>();
    const seenBodies: Array<[string, number]> = [];
    const deduped: Post[] = [];

    for (const post of sorted) {
        const key = post.original_url || post.id;

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);

        const normBody = normaliseBodyForDedup(post.body ?? '');

        if (normBody.length >= MIN_BODY_LENGTH_FOR_SIMILARITY_CHECK) {
            const postTime = Date.parse(post.created_at);

            if (Number.isNaN(postTime)) {
                seenBodies.push([normBody, 0]);
                deduped.push(post);
                continue;
            }

            const postTimeSeconds = postTime / 1000;
            let isDuplicate = false;

            for (const [existingBody, existingTime] of seenBodies) {
                if (
                    Math.abs(postTimeSeconds - existingTime) >
                    SIMILARITY_WINDOW_SECONDS
                ) {
                    continue;
                }

                // similar_text()'s score is at most 2*min(lenA,lenB)/(lenA+lenB) —
                // skip the O(n*m) comparison outright when that ceiling can't
                // reach the threshold (exact bound, not a heuristic: avoids the
                // expensive path for the large majority of non-duplicate pairs
                // during an initial multi-account load without changing results).
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
                    isDuplicate = true;
                    break;
                }
            }

            if (isDuplicate) {
                continue;
            }

            seenBodies.push([normBody, postTimeSeconds]);
        }

        deduped.push(post);
    }

    return deduped.slice(0, bufferSize);
}
