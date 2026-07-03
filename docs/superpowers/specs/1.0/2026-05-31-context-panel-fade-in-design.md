# Context Panel Fade-In Design

**Date:** 2026-05-31
**Branch:** feature/feed-layer-transition

## Problem

`ContextPanel` (reply-to and quote panels) renders above the main post text with no animation. It appears instantly while the text words animate in, creating a visual inconsistency.

## Goal

Fade the context panel(s) in simultaneously with the start of the text word animation, using the existing GSAP infrastructure.

## Scope

All changes are contained in `resources/js/components/feed/PostAnimator.tsx`. No other files change.

## Design

### New ref

```tsx
const panelsRef = useRef<HTMLDivElement>(null);
```

### Body branch JSX change

Wrap the reply_to/quoted_post panels in a ref'd div. The inner `flex flex-col gap-4` preserves spacing that was previously inherited from the parent flex container:

```tsx
{(post.reply_to || post.quoted_post) && (
    <div ref={panelsRef} className="flex flex-col gap-4">
        {post.reply_to && <ContextPanel ... />}
        {post.quoted_post && <ContextPanel ... />}
    </div>
)}
```

### No-body branch JSX change

Add `ref={panelsRef}` to the existing container div that wraps panels and link card in the no-body branch.

### Phase 3 `useGSAP` addition (body posts)

After the template is applied to text words, add a panel fade at timeline position `0` — same tick as the text animation starts:

```tsx
if (panelsRef.current) {
    tl.fromTo(
        panelsRef.current,
        { opacity: 0, y: -8 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" },
        0,
    );
}
```

### New `useGSAP` for no-body + panels

No-body posts skip Phase 3 entirely. A new hook handles the fade-in for posts that have panels but no body text, calling `onReady` on completion:

```tsx
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

### `useLayoutEffect` guard change

The existing effect that fires `onReady` immediately for all no-body posts is guarded so it only fires when there are no panels to animate (media-only and link-only posts):

```tsx
useLayoutEffect(() => {
    if (!body && !(post.reply_to || post.quoted_post)) {
        onReadyRef.current?.();
    }
}, [body, post.reply_to, post.quoted_post]);
```

## Animation Parameters

- **Start:** `opacity: 0, y: -8` (slightly above final position)
- **End:** `opacity: 1, y: 0`
- **Duration:** 0.4s
- **Ease:** `power2.out`
- **Timeline position:** `0` (simultaneous with text animation start)

## What Does Not Change

- `ContextPanel` component — unchanged
- `AnimationTemplate` interface — unchanged
- All 4 animation templates — unchanged
- No-body media-only branch — still calls `onReady` immediately, no animation
- No-body link-only (no panels) branch — still calls `onReady` immediately, no animation

## Test Coverage

No new logic is introduced beyond the animation itself. Existing tests cover `PostAnimator` behaviour. Visual verification via the feed is the primary check.
