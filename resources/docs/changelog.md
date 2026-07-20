---
title: Changelog
last_updated: "2026-07-19"
---

Notable changes to the Bloom application, newest first.

## 2026-07-19 — Milestone 1.10

- **Gravatar profile icon** — your Bloom sidebar profile icon now uses your Gravatar image (based on your account email), falling back to your initials if you don't have one.
- **Content warnings stay visible after you accept them** — previously, accepting a content warning hid all trace that the post had been flagged. Now a warning icon and label stay next to the author's name, on the original post and on any quoted or replied-to post it carries.
- **Content warning whitelist** — in Feed settings, choose specific warning types (adult content, graphic media, self-harm & threats, or general warnings) to always show without the blur overlay.

## 2026-07-19 — Milestone 1.9

- **Mention chips** graduated out of beta — @-mentions in posts appear as interactive avatar chips linking to the mentioned account, now enabled for everyone.
- **Account archival** — accounts inactive for an extended period are warned by email, then archived ("tombstoned") if inactivity continues. Signing in again after archival shows a recovery screen to restore the account or permanently delete it.
- **Fixed** — the public front page could show posts with a content warning or flagged sensitive media to signed-out visitors. These are now filtered out.

## 2026-07-18 — Milestone 1.8

- **Poll results** — posts with a Mastodon poll show live results: option bars with vote counts and percentages, total votes, open/closed status, and your own vote highlighted. Voting itself still happens on Mastodon via a "Vote →" link. Bluesky has no native poll concept, so Bluesky posts are unaffected.
- **Fixed** — boosted posts were exempt from your feed's age cutoff entirely, so a years-old post could always resurface via a recent boost. Boosts are now filtered by when they were boosted, not the original post's age.
- **Fixed** — quote, reply, and link preview cards in image posts left empty space instead of filling the card width.

## 2026-07-05 — Milestone 1.6

- **Content warning overlays** — posts with Bluesky or Mastodon moderation labels show a content warning before revealing the post. The overlay identifies the label type and whether it was applied by the author or a moderation service. Dismissing a warning for an author applies for the rest of your session.
- **Image carousel** — posts with multiple images display a full-screen carousel with navigation and a progress indicator.
- **Feed sidebar** — a sidebar panel shows post metadata and context while reading.
- **Mention chips** — @-mentions in posts appear as interactive avatar chips.
- **Keyboard shortcuts** — vim-style shortcuts: `j`/`k` to navigate posts, `?` to view all shortcuts.
- **Public feeds** — support for Mastodon public timelines and Bluesky custom feeds alongside home timelines.
- **Matomo analytics** — privacy-respecting analytics to help improve the product.

## 2026-06-01 — Milestone 1.5

- **User roles** — admin, beta tester, and subscriber roles with gated feature access.
- **Sidebar navigation redesign** — cleaner navigation layout.

## 2026-05-01 — Milestone 1.0

- **Passkey authentication** — passwordless sign-in using WebAuthn passkeys, with email-based recovery.
- **Multiple social accounts** — connect multiple Mastodon and Bluesky accounts to a single Bloom account.
- **Full-screen feed** — immersive, distraction-free reading experience with no infinite scroll.
- **Mastodon and Bluesky support** — home timelines from both platforms aggregated into one feed.
