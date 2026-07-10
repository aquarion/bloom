# Poll Display Design

**Date:** 2026-07-10
**Issue:** #193 — "Support Poll display"

## Problem

Posts in the feed can carry a poll (Mastodon status API `poll` field), but Bloom currently drops that data entirely during normalization — polls are invisible in the feed.

## Goal

When a post contains a poll, display the current results (options, vote counts/percentages, total votes, open/closed status, and the connected account's own vote if any) with a "Vote" button that links out to the original post, where voting actually happens.

## Scope

- **Mastodon only.** Bluesky's AT Protocol has no native poll lexicon today (confirmed via `PostNormalizer::fromBluesky` and a graphify-assisted codebase scan — no `poll` references anywhere in `app/Services`). The `Post.poll` field is optional everywhere; Bluesky-sourced posts simply never populate it. If Bluesky adds poll support later, this is a normalizer-only change.
- **External voting only.** The vote button opens `post.original_url` in a new tab (same pattern as `Attribution.tsx`). No in-app vote submission, no new OAuth scopes, no new API endpoints, no migrations.

## Design

### 1. Data model — `resources/js/types/post.ts`

```ts
interface PollOption {
  title: string;
  votes_count: number | null; // null if votes are hidden until the poll closes
}

interface Poll {
  id: string;
  expires_at: string | null;
  expired: boolean;
  multiple: boolean;
  votes_count: number;
  options: PollOption[];
  voted: boolean;
  own_votes: number[]; // indices into options[]
}

interface Post {
  // ...existing fields
  poll?: Poll;
}
```

### 2. Backend normalization — `app/Services/Feed/PostNormalizer.php`

New private helper, called from `fromMastodon()` only:

```php
private function normalizePoll(array $source): ?array
{
    $poll = $source['poll'] ?? null;
    if ($poll === null) {
        return null;
    }

    return [
        'id' => $poll['id'],
        'expires_at' => $poll['expires_at'],
        'expired' => $poll['expired'],
        'multiple' => $poll['multiple'],
        'votes_count' => $poll['votes_count'],
        'options' => array_map(
            fn (array $opt) => ['title' => $opt['title'], 'votes_count' => $opt['votes_count']],
            $poll['options'],
        ),
        'voted' => $poll['voted'] ?? false,
        'own_votes' => $poll['own_votes'] ?? [],
    ];
}
```

`fromBluesky()` is untouched — the `poll` key is simply absent from Bluesky-normalized posts.

### 3. Frontend component — `resources/js/components/feed/PollResults.tsx` (new)

- Each option renders as a horizontal bar, width = `votes_count / poll.votes_count * 100%`, labeled with title, vote count, and percentage.
- If `poll.voted`, the option(s) at indices in `poll.own_votes` get a distinguishing style (checkmark icon + bold border), reusing existing badge/icon primitives from `resources/js/components/ui/`.
- Header row: `"{votes_count} votes total"` plus status — `"Poll closed"` if `expired`, else relative time until `expires_at` (reuse the existing relative-time formatting already used elsewhere in `PostAnimator.tsx`).
- If `poll.multiple`, show a small "multiple choice" label near the header (informational only — no interactive checkboxes, since in-app voting is out of scope).
- Footer: `<a href={post.original_url} target="_blank" rel="noopener noreferrer">Vote →</a>`, styled consistently with `Attribution.tsx`'s external-link treatment.

### 4. Rendering integration — `resources/js/components/feed/PostAnimator.tsx`

Poll renders as its own block, after body text and before the link card, inside the same content-warning-gated block as the rest of the post body (a CW'd post keeps its poll hidden until the overlay is dismissed):

```tsx
{post.body}
{post.poll && <PollResults poll={post.poll} originalUrl={post.original_url} />}
{/* existing context panels */}
{/* existing link card */}
```

## Testing Plan

- **Backend** (`tests/Unit/Feed/PostNormalizerTest.php`, existing file): Mastodon status with a poll normalizes correctly; status without a poll → `poll` key absent/null; multiple-choice poll; expired poll; poll where the connected account has voted (`voted: true`, `own_votes` populated).
- **Frontend** (`resources/js/components/feed/PollResults.test.tsx`, new — matches the `ImageCarousel.test.tsx` / `ProgressBar.test.tsx` per-component convention): bars render with correct percentages; "Poll closed" vs relative expiry text; own-vote highlight; vote link points to `original_url`.
- **Integration**: extend the existing feed smoke/browser test that exercises `PostContent` to cover a Mastodon post with a poll, asserting it renders without JS errors.

## Files to Change

- `resources/js/types/post.ts` — add `Poll`, `PollOption`, `Post.poll`
- `app/Services/Feed/PostNormalizer.php` — add `normalizePoll()`, call from `fromMastodon()`
- `resources/js/components/feed/PollResults.tsx` — new component
- `resources/js/components/feed/PollResults.test.tsx` — new test
- `resources/js/components/feed/PostAnimator.tsx` — render `PollResults` conditionally
- `tests/Unit/Feed/PostNormalizerTest.php` — new poll test cases
