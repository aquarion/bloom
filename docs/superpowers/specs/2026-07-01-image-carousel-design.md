# Image Carousel Design

**Issue:** #136 — Bluesky carousels
**Date:** 2026-07-01
**Branch:** feature/issue-136-image-carousel (to be created)

## Problem

Images are currently rendered as dim (40% opacity) backgrounds behind animated text. For posts with images, the images aren't actually viewable. Multi-image (carousel) posts from Bluesky only show the first image and ignore the rest.

The backend already normalises all carousel images into `post.media[]` correctly — this is a purely frontend change.

## Decisions

| Question | Decision |
|---|---|
| Text+image layout | Image dominant: image fills the main area, text in a compact panel below |
| Carousel navigation | Auto-advance on a timer (Stories-style progress bars), tap left/right to manually advance |
| Timer per image | Each image gets its own full timer slot (8s default) |
| Implementation | New `ImageCarousel` component; `PostAnimator` delegates to it when `post.media.length > 0` |

## Architecture

### New component: `ImageCarousel`

`resources/js/components/feed/ImageCarousel.tsx`

**Props:**
- `media: MediaAttachment[]` — all images/videos for the post
- `duration: number` — milliseconds per image (default 8000, matches feed timer)
- `paused: boolean` — mirrors feed pause state (spacebar)
- `blurMedia: boolean` — sensitive media blur flag
- `onRevealMedia: () => void` — clears sensitive media blur
- `onComplete: () => void` — fires after the last image's timer elapses

**Behaviour:**
- Renders the current image full-height, `object-contain`, with padding
- Progress bars at the top of the image area — one bar per image, filled left-to-right as each timer runs
- Timer is paused when `paused=true` or `blurMedia=true`
- Tapping the left half goes to the previous image (does nothing on the first image); tapping the right half advances to the next image, or fires `onComplete` immediately if already on the last image
- When the last image's timer completes naturally, calls `onComplete`
- For single-image posts, renders one progress bar that fills over `duration` ms, then calls `onComplete`
- Sensitive media blur overlays all images; revealing it resumes the timer for all images in the post
- For video media, shows the `preview_url` thumbnail (video playback is out of scope)

### Changes to `PostAnimator`

**New branch at the top of the render:**

```
if (post.media.length > 0):
  render ImageCarousel (top portion, flex-1)
  render text panel below (if post.body exists)
  onComplete → onReady
else:
  existing text animation logic (unchanged)
```

The text panel for image posts is a simple static display (no big animated text, no GSAP). It shows the post body in a compact dark panel, consistent with the `ContextPanel` style already used for reply/quote panels.

Context panels (reply_to, quoted_post) and the link card are shown below the text panel when present.

### Changes to `PostBackground`

When `post.media.length > 0`, `PostBackground` skips rendering `MediaBackground` (the dim image overlay). The background falls through to the author banner blur or the solid colour derived from the author handle. This keeps the area behind the text panel visually clean.

`MediaBackground` component itself is left intact for potential future use.

### Timer flow

```
Post appears
  → ImageCarousel image 1 timer (8s)
  → ImageCarousel image 2 timer (8s)
  → ...
  → ImageCarousel image N timer (8s) → onComplete() → onReady()
  → feed useAutoAdvance timer (8s)
  → handleAdvance() → next post
```

The `paused` prop is threaded through from `feed.tsx` → `PostContent` → `PostAnimator` → `ImageCarousel` so spacebar pause works at all stages including mid-carousel.

## Scope

**In scope:**
- `ImageCarousel` component with auto-advance timer and progress bars
- Manual left/right tap zones
- Sensitive media blur integration
- `PostAnimator` delegation to `ImageCarousel` for all posts with media
- `PostBackground` no longer rendering dim image overlay for image posts
- Tests for `ImageCarousel` timer behaviour and `PostAnimator` branching

**Out of scope:**
- Video playback (carousels show video thumbnails only, same as current)
- Mastodon multi-image posts (the carousel will benefit them automatically since `post.media[]` already contains all attachments for Mastodon too — no special work needed)
- Lightbox / fullscreen image view on click
- Swipe gesture support

## Files to create / modify

| File | Change |
|---|---|
| `resources/js/components/feed/ImageCarousel.tsx` | **Create** |
| `resources/js/components/feed/ImageCarousel.test.tsx` | **Create** |
| `resources/js/components/feed/PostAnimator.tsx` | Modify: add image branch, pass `paused` through |
| `resources/js/components/feed/PostBackground.tsx` | Modify: skip MediaBackground when media present |
| `resources/js/components/feed/PostContent.tsx` | Modify: pass `paused` prop down to PostAnimator |
| `resources/js/pages/feed.tsx` | Modify: pass `paused` down through PostContent |
