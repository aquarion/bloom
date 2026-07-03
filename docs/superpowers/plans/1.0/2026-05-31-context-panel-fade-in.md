# Context Panel Fade-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fade `ContextPanel` (reply-to and quote panels) in simultaneously with the text word animation start, and animate them on no-body posts too.

**Architecture:** All changes are in `PostAnimator.tsx`. A new `panelsRef` targets the panels container. Phase 3's GSAP timeline gets a `fromTo` on `panelsRef` at position `0`. A new `useGSAP` handles the no-body+panels path. The `useLayoutEffect` that fires `onReady` immediately is guarded to skip posts that have panels (which now have their own animation).

**Tech Stack:** React, GSAP (`useGSAP`, `gsap.fromTo`), TypeScript

---

## File Map

| Action | File |
|--------|------|
| Modify | `resources/js/components/feed/PostAnimator.tsx` |

---

## Task 1: Add `panelsRef`, guard `useLayoutEffect`, animate panels in Phase 3 and no-body branch

**Files:**
- Modify: `resources/js/components/feed/PostAnimator.tsx`

This task makes all changes to `PostAnimator.tsx` in one pass. Read the full file first, then apply each edit.

- [ ] **Step 1: Read the current file**

```bash
cat -n /home/aquarion/code/aquarion/sprouter/resources/js/components/feed/PostAnimator.tsx
```

- [ ] **Step 2: Add `panelsRef` after the existing refs (after line 149)**

Find this block (lines 146–155):

```tsx
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	const onReadyRef = useRef(onReady);
	const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
```

Replace with:

```tsx
	const containerRef = useRef<HTMLDivElement>(null);
	const textRef = useRef<HTMLDivElement>(null);
	const panelsRef = useRef<HTMLDivElement>(null);
	const onReadyRef = useRef(onReady);
	const lineRefs = useRef<(HTMLSpanElement | null)[]>([]);
```

- [ ] **Step 3: Guard the `useLayoutEffect` that fires `onReady` immediately**

Find (lines 198–203):

```tsx
	// Fire onReady immediately for media-only posts (no text to animate).
	useLayoutEffect(() => {
		if (!body) {
			onReadyRef.current?.();
		}
	}, [body]);
```

Replace with:

```tsx
	// Fire onReady immediately only when there is no body AND no panels to animate.
	useLayoutEffect(() => {
		if (!body && !(post.reply_to || post.quoted_post)) {
			onReadyRef.current?.();
		}
	}, [body, post.reply_to, post.quoted_post]);
```

- [ ] **Step 4: Add panel fade-in to Phase 3's GSAP timeline**

Find (lines 299–300):

```tsx
		const tl = gsap.timeline({ onComplete: () => onReadyRef.current?.() });
		template(tl, split.words as Element[], container);
```

Replace with:

```tsx
		const tl = gsap.timeline({ onComplete: () => onReadyRef.current?.() });
		template(tl, split.words as Element[], container);

		if (panelsRef.current) {
			tl.fromTo(
				panelsRef.current,
				{ opacity: 0, y: -8 },
				{ opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
				0,
			);
		}
```

- [ ] **Step 5: Add new `useGSAP` for no-body + panels**

Insert this block immediately after the closing `}, [post.id, fontSizes]);` of Phase 3's `useGSAP` (after line 306), before the `if (!body) {` early return:

```tsx
	// Fade panels in for no-body posts that have context panels (Phase 3 doesn't run for these).
	useGSAP(() => {
		if (body || !panelsRef.current || !(post.reply_to || post.quoted_post)) {
			return;
		}

		gsap.fromTo(
			panelsRef.current,
			{ opacity: 0, y: -8 },
			{
				opacity: 1,
				y: 0,
				duration: 0.4,
				ease: "power2.out",
				onComplete: () => onReadyRef.current?.(),
			},
		);
	}, [post.id, body]);
```

- [ ] **Step 6: Wrap body-branch panels in a ref'd div**

Find the body-branch JSX (inside the final `return`, around line 377). The outer flex container currently has the panels and text as direct siblings:

```tsx
			<div className="flex flex-col items-center gap-4">
				{post.reply_to && (
					<ContextPanel
						icon={<Reply className="size-3.5" />}
						author_name={post.reply_to.author_name}
						author_avatar={post.reply_to.author_avatar}
						author_handle={post.reply_to.author_handle}
						emojis={post.emojis}
						body={post.reply_to.body}
						original_url={post.reply_to.original_url}
					/>
				)}
				{post.quoted_post && (
					<ContextPanel
						icon={<Quote className="size-3.5" />}
						author_name={post.quoted_post.author_name}
						author_avatar={post.quoted_post.author_avatar}
						author_handle={post.quoted_post.author_handle}
						emojis={post.emojis}
						body={post.quoted_post.body}
						original_url={post.quoted_post.original_url}
					/>
				)}
				<div
```

Replace with:

```tsx
			<div className="flex flex-col items-center gap-4">
				{(post.reply_to || post.quoted_post) && (
					<div ref={panelsRef} className="flex flex-col gap-4">
						{post.reply_to && (
							<ContextPanel
								icon={<Reply className="size-3.5" />}
								author_name={post.reply_to.author_name}
								author_avatar={post.reply_to.author_avatar}
								author_handle={post.reply_to.author_handle}
								emojis={post.emojis}
								body={post.reply_to.body}
								original_url={post.reply_to.original_url}
							/>
						)}
						{post.quoted_post && (
							<ContextPanel
								icon={<Quote className="size-3.5" />}
								author_name={post.quoted_post.author_name}
								author_avatar={post.quoted_post.author_avatar}
								author_handle={post.quoted_post.author_handle}
								emojis={post.emojis}
								body={post.quoted_post.body}
								original_url={post.quoted_post.original_url}
							/>
						)}
					</div>
				)}
				<div
```

- [ ] **Step 7: Add `ref={panelsRef}` to the no-body branch container**

Find the no-body+panels branch (around line 328–363):

```tsx
		if (post.link_url || post.quoted_post || post.reply_to) {
			return (
				<div className="flex h-full w-full items-center justify-center p-8">
					<div className="flex flex-col items-center gap-4">
```

Replace the inner div with:

```tsx
		if (post.link_url || post.quoted_post || post.reply_to) {
			return (
				<div className="flex h-full w-full items-center justify-center p-8">
					<div ref={panelsRef} className="flex flex-col items-center gap-4">
```

- [ ] **Step 8: Type-check and build**

```bash
cd /home/aquarion/code/aquarion/sprouter && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no TypeScript errors.

- [ ] **Step 9: Run PHP tests**

```bash
./vendor/bin/pest --stop-on-failure 2>&1 | tail -10
```

Expected: all tests pass (158).

- [ ] **Step 10: Commit**

```bash
git add resources/js/components/feed/PostAnimator.tsx
git commit -m "🖼️ Fade context panels in with text animation"
```

---

## Verification

- [ ] Open the feed in a browser and navigate to a post that has a reply-to or quote panel with body text — confirm the panel fades up from slightly above (`y: -8`) simultaneously with the text word animation
- [ ] Find a no-body post that has reply-to or quote panels (no text) — confirm the panels fade in on arrival
- [ ] Find a media-only post (no panels) — confirm it still loads instantly with no animation delay
- [ ] Find a link-only post (no panels) — confirm it still loads instantly with no animation delay
