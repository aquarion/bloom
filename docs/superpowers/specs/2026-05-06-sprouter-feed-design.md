# Sprouter Feed — Design Spec

**Date:** 2026-05-06
**Status:** Approved

## Overview

Sprouter is a full-screen, read-only social media reader that displays one post at a time from the user's Mastodon and/or Bluesky home timelines. Posts advance automatically and are presented with kinetic typography animations — words build sequentially into a composed shape, which then rotates on completion. Between posts, a zoom-through transition dissolves the old post outward and materialises the next.

---

## Architecture

### Backend — Laravel 13

Laravel acts as an OAuth broker and API proxy. It handles authentication with external networks, stores tokens, fetches home timeline posts, normalises them to a unified format, and serves them to the frontend via Inertia and a JSON endpoint.

The frontend never communicates directly with Mastodon or Bluesky.

### Frontend — React + Inertia + GSAP

A single full-screen Inertia page. No page navigations during the feed experience. Posts are held in a client-side queue; the frontend refills the queue via Axios as it runs low.

All animation is handled by GSAP with the `@gsap/react` `useGSAP` hook. SplitText splits post body text into individually animatable word elements.

---

## Data Model

### Unified Post Format

Both networks' posts are mapped to this shape before reaching the frontend:

```ts
interface Post {
  id: string;
  source: 'mastodon' | 'bluesky';
  author_name: string;
  author_handle: string;       // e.g. @someone@mastodon.social
  author_avatar: string;       // URL
  body: string;                // plain text, HTML stripped
  media: MediaAttachment[];
  created_at: string;          // ISO 8601
  original_url: string;
}

interface MediaAttachment {
  type: 'image' | 'video';
  url: string;
  preview_url: string;
  alt_text: string | null;
}
```

### Database

`social_accounts` table linked to `users`:

| column | type |
|---|---|
| id | bigint |
| user_id | bigint (FK) |
| provider | enum('mastodon', 'bluesky') |
| instance_url | varchar (Mastodon only) |
| access_token | text (encrypted) |
| token_secret | text (encrypted, Mastodon refresh token) |
| handle | varchar |
| created_at / updated_at | timestamps |

---

## Authentication

### App accounts
Standard Fortify email/password. Social connections are separate from app login.

### Mastodon
OAuth 2.0 with dynamic client registration. Flow:
1. User enters their instance URL
2. Laravel calls the instance's `/api/v1/apps` endpoint to register dynamically
3. Laravel redirects the user through the instance's OAuth authorization URL
4. On callback, Laravel exchanges the code for an access token and stores it encrypted

### Bluesky
App passwords (AT Protocol). Flow:
1. User generates an app password in their Bluesky account settings
2. User enters their handle and app password in Sprouter
3. Laravel calls the ATP `createSession` endpoint and stores the resulting access + refresh tokens encrypted

Bluesky atproto OAuth can replace this in a future iteration.

---

## Feed Management

### Initial load
On page load, Laravel fetches the home timeline from all connected accounts, merges results, sorts by `created_at` descending, and passes the first **20 posts** as Inertia props.

### Refill
When the client-side queue drops to **5 posts remaining**, the frontend sends:
```
GET /feed?before={oldest_post_id}
```
Laravel returns the next 20 posts. Results are appended to the queue.

### Auto-advance
Each post displays for **8 seconds**:
- ~4s for the within-post word animation to complete
- ~4s hold time to read the composed result

The user can:
- **Pause / resume** — ⏸/▶️ button, bottom-right
- **Skip forward** — keyboard arrow key or dedicated gesture (future)

A 2px progress bar at the bottom edge of the screen shows time remaining on the current post.

---

## Animation System

### Within-post — word-building templates

GSAP + SplitText splits the post body into word-level spans. One of four templates is chosen randomly per post. Each template is a function with the signature:

```ts
type AnimationTemplate = (
  tl: gsap.core.Timeline,
  words: Element[],
  container: Element
) => void;
```

**Template 1 — Block + tilt**
Words drop in sequentially (in text order), displayed at varying sizes for visual hierarchy, into a centred typographic composition. On completion, the whole block tilts ~6° via a chained `.to()`.

**Template 2 — Spiral / converge**
Words fly in from random screen-edge positions and lock into their final layout positions, building from the outside inward.

**Template 3 — Stack + 3D flip**
Words stack as a vertical column, sliding in from the left. On completion, the stack rotates 360° on the Y axis (`rotationY`).

**Template 4 — Arc**
Words arrange along a curve. The longest word in the post arrives last and lands in the centre as the focal point.

### Between-post — zoom through

When the auto-advance timer expires, a single GSAP timeline runs:
1. Current post: scale to 1.3 + blur to 8px + fade to 0 (~0.3s)
2. Next post: scale from 0.7 + blur from 8px + fade to 1 (~0.3s)

Total transition: ~0.6s. The next post's within-post animation starts after the enter completes.

### Implementation notes
- `useGSAP` from `@gsap/react` owns all timeline creation and cleanup — no raw `useEffect` for animations
- Templates are pure functions; the `PostAnimator` component is responsible for SplitText setup and template selection
- Template selection is random but weighted to avoid repeating the same template on consecutive posts

---

## UI & Layout

### Full-screen post view

```
┌─────────────────────────────────┐
│ [mastodon.social]               │  ← source badge, top-left
│                                 │
│                                 │
│     words build here            │  ← centred text area
│     into a shape                │     GSAP animates word elements
│                                 │
│                                 │
│ [avatar] Name        @handle ↗  │[⏸]│  ← attribution (tap = open original)
└─────────────────────────────────┘
  ████████████░░░░░░░░░░░░░░░░░░    ← 2px progress bar, bottom edge
```

- **Background:** If the post has a media attachment, one image is shown as a dimmed (`opacity: 0.4`) full-screen background. Video attachments use the thumbnail. No autoplay.
- **Source badge:** Provider name (instance URL for Mastodon, `bsky.app` for Bluesky), top-left
- **Text area:** Fills the centre of the screen; GSAP word elements positioned within
- **Attribution row:** Author avatar, display name, handle. Entire row is a link — tapping opens `original_url` in a new tab
- **Pause button:** ⏸/▶️ emoji button, bottom-right of the attribution row
- **Progress bar:** 2px bar at the very bottom edge, animates from full to empty over 8s, resets on each new post

---

## Out of Scope (this version)

- Composing or replying to posts
- Likes, boosts, reposts from within Sprouter
- Notifications
- Bluesky atproto OAuth (app passwords for now)
- Twitter/X integration
- Per-user timing preferences
- Accessibility / reduced-motion support (future consideration)
