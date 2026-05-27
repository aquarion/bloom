# Video Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix video posts (Bluesky and Mastodon) rendering blank by normalising Bluesky video embeds and displaying video thumbnails in the no-body PostAnimator branch.

**Architecture:** Two independent fixes. Backend: extend `normaliseBlueskyMedia()` in `PostNormalizer` to handle `app.bsky.embed.video#view` by extracting the HLS playlist URL and thumbnail. Frontend: PostAnimator's no-body media branch already uses `<img>` with `firstMedia.url` — for video types, switch to `firstMedia.preview_url` (the thumbnail) so an mp4 URL is never dropped into an `<img>` src. `MediaBackground` already uses this pattern (`first.type === "video" ? first.preview_url : first.url`).

**Tech Stack:** PHP 8.4, Laravel 13, Pest, React/TypeScript, Inertia.js

---

## File Map

| File | Change |
|------|--------|
| `app/Services/Feed/PostNormalizer.php` | Add `app.bsky.embed.video#view` branch in `normaliseBlueskyMedia()` |
| `tests/Unit/Feed/PostNormalizerTest.php` | Add Bluesky video test case; add Mastodon video test case |
| `resources/js/components/feed/PostAnimator.tsx` | Use `preview_url` when `firstMedia.type === 'video'` in no-body branch |

---

### Task 1: Normalise Bluesky video embeds

The `app.bsky.embed.video#view` lexicon has these fields:
- `playlist` (string, required) — HLS stream URI
- `thumbnail` (string, optional) — thumbnail image URI
- `alt` (string, optional) — alt text

**Files:**
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`
- Modify: `app/Services/Feed/PostNormalizer.php`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/Unit/Feed/PostNormalizerTest.php` after the existing Bluesky image test:

```php
it('normalises a bluesky video embed post', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/vid1',
            'record' => ['text' => '', 'createdAt' => '2024-01-15T12:00:00.000Z'],
            'author' => [
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/avatar.jpg',
            ],
            'embed' => [
                '$type' => 'app.bsky.embed.video#view',
                'cid' => 'bafytest123',
                'playlist' => 'https://video.bsky.app/watch/did:plc:abc/playlist.m3u8',
                'thumbnail' => 'https://video.bsky.app/watch/did:plc:abc/thumbnail.jpg',
                'alt' => 'A test video',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['media'])->toHaveCount(1)
        ->and($post['media'][0]['type'])->toBe('video')
        ->and($post['media'][0]['url'])->toBe('https://video.bsky.app/watch/did:plc:abc/playlist.m3u8')
        ->and($post['media'][0]['preview_url'])->toBe('https://video.bsky.app/watch/did:plc:abc/thumbnail.jpg')
        ->and($post['media'][0]['alt_text'])->toBe('A test video');
});

it('normalises a bluesky video embed post with no thumbnail', function () {
    $feedPost = [
        'post' => [
            'uri' => 'at://did:plc:abc/app.bsky.feed.post/vid2',
            'record' => ['text' => '', 'createdAt' => '2024-01-15T12:00:00.000Z'],
            'author' => [
                'displayName' => 'Alice',
                'handle' => 'alice.bsky.social',
                'avatar' => 'https://cdn.bsky.app/avatar.jpg',
            ],
            'embed' => [
                '$type' => 'app.bsky.embed.video#view',
                'cid' => 'bafytest456',
                'playlist' => 'https://video.bsky.app/watch/did:plc:abc/playlist2.m3u8',
            ],
        ],
    ];

    $post = (new PostNormalizer)->fromBluesky($feedPost);

    expect($post['media'])->toHaveCount(1)
        ->and($post['media'][0]['type'])->toBe('video')
        ->and($post['media'][0]['url'])->toBe('https://video.bsky.app/watch/did:plc:abc/playlist2.m3u8')
        ->and($post['media'][0]['preview_url'])->toBeNull()
        ->and($post['media'][0]['alt_text'])->toBeNull();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="bluesky video"
```

Expected: 2 failures — `$post->media` is empty array because video embed returns `[]`.

- [ ] **Step 3: Add video case to `normaliseBlueskyMedia()`**

In `app/Services/Feed/PostNormalizer.php`, update `normaliseBlueskyMedia()`:

```php
private function normaliseBlueskyMedia(?array $embed): array
{
    if ($embed === null) {
        return [];
    }

    if ($embed['$type'] === 'app.bsky.embed.images#view') {
        return array_map(fn ($img) => [
            'type' => 'image',
            'url' => $img['fullsize'],
            'preview_url' => $img['thumb'],
            'alt_text' => $img['alt'] ?: null,
        ], $embed['images'] ?? []);
    }

    if ($embed['$type'] === 'app.bsky.embed.video#view') {
        return [[
            'type' => 'video',
            'url' => $embed['playlist'],
            'preview_url' => $embed['thumbnail'] ?? null,
            'alt_text' => $embed['alt'] ?? null,
        ]];
    }

    return [];
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="bluesky video"
```

Expected: 2 tests pass.

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
./vendor/bin/pest
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Feed/PostNormalizer.php tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🎇 Normalise Bluesky video embeds in PostNormalizer"
```

---

### Task 2: Add Mastodon video normalisation test

`normaliseMastodonMedia()` already passes video through with `url` and `preview_url`. This task adds a regression test to lock that behaviour in.

**Files:**
- Modify: `tests/Unit/Feed/PostNormalizerTest.php`

- [ ] **Step 1: Write the test**

Add after the existing Mastodon image test in `tests/Unit/Feed/PostNormalizerTest.php`:

```php
it('normalises a mastodon video attachment', function () {
    $status = [
        'id' => '999',
        'content' => '',
        'created_at' => '2024-01-15T12:00:00.000Z',
        'account' => [
            'display_name' => 'Bob',
            'acct' => 'bob@fosstodon.org',
            'avatar' => 'https://fosstodon.org/avatars/bob.jpg',
        ],
        'url' => 'https://fosstodon.org/@bob/999',
        'media_attachments' => [
            [
                'type' => 'video',
                'url' => 'https://fosstodon.org/media/video.mp4',
                'preview_url' => 'https://fosstodon.org/media/video_thumb.jpg',
                'description' => 'A cat video',
            ],
        ],
        'reblog' => null,
        'in_reply_to_id' => null,
        'card' => null,
        'quote' => null,
    ];

    $post = (new PostNormalizer)->fromMastodon($status);

    expect($post['media'])->toHaveCount(1)
        ->and($post['media'][0]['type'])->toBe('video')
        ->and($post['media'][0]['url'])->toBe('https://fosstodon.org/media/video.mp4')
        ->and($post['media'][0]['preview_url'])->toBe('https://fosstodon.org/media/video_thumb.jpg')
        ->and($post['media'][0]['alt_text'])->toBe('A cat video');
});
```

- [ ] **Step 2: Run the test**

```bash
./vendor/bin/pest tests/Unit/Feed/PostNormalizerTest.php --filter="mastodon video"
```

Expected: passes (existing behaviour is correct, test confirms it).

- [ ] **Step 3: Commit**

```bash
git add tests/Unit/Feed/PostNormalizerTest.php
git commit -m "🪳 Add regression test for Mastodon video attachment normalisation"
```

---

### Task 3: Fix PostAnimator no-body branch for video

The no-body media branch uses `<img src={firstMedia.url}>`. For video type, `url` is an mp4/HLS URL which silently fails in an `<img>`. Display the thumbnail (`preview_url`) instead — matching the pattern already used in `MediaBackground.tsx`.

**Files:**
- Modify: `resources/js/components/feed/PostAnimator.tsx`

- [ ] **Step 1: Locate the no-body branch**

Open `resources/js/components/feed/PostAnimator.tsx`. Find the section that reads:

```tsx
if (!body) {
    const firstMedia = post.media[0];

    if (firstMedia) {
        return (
            <div className="flex h-full w-full items-center justify-center p-4">
                <img
                    src={firstMedia.url}
                    alt={firstMedia.alt_text ?? ""}
                    className="max-h-full max-w-full rounded object-contain"
                />
            </div>
        );
    }
```

- [ ] **Step 2: Apply the fix**

Replace the `<img>` block so it uses `preview_url` for video:

```tsx
if (!body) {
    const firstMedia = post.media[0];

    if (firstMedia) {
        const displaySrc =
            firstMedia.type === "video"
                ? firstMedia.preview_url
                : firstMedia.url;

        return (
            <div className="flex h-full w-full items-center justify-center p-4">
                <img
                    src={displaySrc ?? ""}
                    alt={firstMedia.alt_text ?? ""}
                    className="max-h-full max-w-full rounded object-contain"
                />
            </div>
        );
    }
```

- [ ] **Step 3: Run the full test suite**

```bash
./vendor/bin/pest
```

Expected: all tests pass (no PHP tests cover this component directly, but confirms no regressions elsewhere).

- [ ] **Step 4: Run type check**

```bash
npm run types:check
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx
git commit -m "🪳 Use preview_url thumbnail for video in PostAnimator no-body branch"
```

---

## Self-Review

**Spec coverage:**
- ✅ Bluesky `app.bsky.embed.video#view` not handled → Task 1 adds the handler
- ✅ `preview_url` used for Bluesky thumbnail → Task 1 maps `thumbnail` → `preview_url`
- ✅ Mastodon video renders `<img>` with mp4 URL → Task 3 fixes the display src
- ✅ Mastodon normalization already correct → Task 2 adds the regression test
- ✅ No-thumbnail Bluesky video → Task 1 test 2 covers `preview_url: null`; Task 3 uses `?? ""` so blank img is shown rather than crashing

**Placeholder scan:** None found.

**Type consistency:** `firstMedia.type`, `firstMedia.preview_url`, `firstMedia.url`, `firstMedia.alt_text` all match fields on `MediaAttachment` in `resources/js/types/post.ts`.
