# Feed sidebar panel design (#86)

## Problem

The feed page (`resources/js/pages/feed.tsx`) is a full-screen immersive view with no app navigation visible. The Home icon in its top-left chrome currently navigates away entirely (`<Link href={connectionsEdit()}>`), taking the user off the feed and losing their place in it. There's no way to reach other parts of the app (Accounts, Feed Settings, Profile, Security, Appearance, logout) from the feed without abandoning it.

## Solution

Replace the Home icon's navigation with a toggle that opens the standard app sidebar (`AppSidebarContents`) as a slide-in overlay drawer on top of the feed, instead of navigating away.

### Behavior

- Clicking the Home icon opens a drawer that slides in from the left over a dimmed backdrop, covering part of the feed.
- The drawer contains the exact same content as `AppSidebarContents` used elsewhere in the app: logo, user info, Feed/Accounts/Feed Settings nav, Profile/Security/Appearance nav, footer links (Repository, Report an issue), app version, and logout — for consistency and zero duplicated nav logic.
- Closing: clicking the backdrop, pressing Escape, or clicking the Home icon again (toggle). This matches Radix Dialog's built-in behavior (the underlying primitive for `Sheet`).
- The feed's auto-advance timer (`useAutoAdvance`) keeps running in the background while the drawer is open — opening the drawer does not pause the feed.
- Keyboard shortcuts (`j`/`k`/`space`/`o`/`l`/`?`) continue to work while the drawer is open — no suppression.
- Clicking a real nav link inside the drawer (e.g. "Accounts") navigates away from the feed as normal via Inertia — the drawer's open/closed state becomes moot once the page changes.
- Scope: feed page only. The welcome page has a visually similar circular icon in its chrome, but it's a different, unauthenticated context (no sidebar to show) and is out of scope for this change.

### Why an overlay drawer, not a push-panel or persistent rail

An overlay drawer with a dimmed backdrop was chosen over two alternatives:
- **Push panel** (sidebar shifts the feed content over): rejected because the feed is full-bleed (background image/video, edge-to-edge content) — shrinking it to make room for a sidebar would resize active media awkwardly mid-transition.
- **Persistent icon rail + expand**: rejected as unnecessary complexity for a panel that's only open briefly; the feed's chrome is already minimal by design (full-screen immersion is the point), so a permanently-visible rail working against that.

The overlay drawer also matches a pattern already in this codebase: `Sidebar` (`resources/js/components/ui/sidebar.tsx`) already renders as a `Sheet`-based slide-in drawer with backdrop on mobile viewports. This feature is conceptually "always render the sidebar in its mobile/drawer form" — just triggered from the feed page itself rather than by viewport width.

## Implementation approach

`AppSidebarContents` cannot be dropped into an arbitrary tree as-is: its `SidebarMenuButton` calls `useSidebar()` internally (for collapse/tooltip behavior), which throws `"useSidebar must be used within a SidebarProvider"` if there's no ancestor `SidebarProvider`. The feed page does not currently use `AppSidebarLayout` (its layout is `null` per `app.tsx`'s `layout()` switch), so there's no existing provider in the tree.

The fix is **not** to wrap the feed page in `AppSidebarLayout` (that component assumes permanent, always-visible chrome — wrong fit for a full-screen feed with an on-demand drawer). Instead, the feed page renders a local, self-contained drawer:

- A new component, e.g. `resources/js/components/feed/FeedSidebarPanel.tsx`, accepting `open` / `onOpenChange` props.
- Internally: `<Sheet open={open} onOpenChange={onOpenChange}><SheetContent side="left" className="p-0"><SidebarProvider><AppSidebarContents /></SidebarProvider></SheetContent></Sheet>` — reusing the exact same `Sheet`/`SheetContent` primitives `Sidebar` already uses for its mobile rendering, plus a local `SidebarProvider` purely to satisfy `AppSidebarContents`'s context requirement (not to drive any responsive collapse/expand behavior — the drawer is always "open" or "closed", no collapsed-icon-rail state needed here).
- `feed.tsx` holds local `const [panelOpen, setPanelOpen] = useState(false)` and changes the Home button from a `<Link>` to a `<button onClick={() => setPanelOpen((o) => !o)}>`, rendering `<FeedSidebarPanel open={panelOpen} onOpenChange={setPanelOpen} />` alongside the existing chrome.
- No changes to `useAutoAdvance`, `useKeyboardShortcuts`, or any state on the feed page beyond adding `panelOpen` — per the design decisions above, both keep running unmodified while the drawer is open.

## Testing

- Component test for `FeedSidebarPanel`: renders nothing visible when `open=false`; renders `AppSidebarContents` content when `open=true`; calls `onOpenChange(false)` when triggered (mirroring the existing `MatomoInit`/page-component test patterns: `vi.mock('@inertiajs/react')`, `render`, `screen`).
- Update/extend feed page tests (if any exist) or add a focused test asserting the Home button toggles `panelOpen` rather than rendering a `Link` to `connectionsEdit()`.
- No backend changes — no PHP test surface for this feature.

## Out of scope

- Welcome page's icon (different context, not addressed here)
- Suppressing keyboard shortcuts while the drawer is open (explicitly decided against)
- Pausing auto-advance while the drawer is open (explicitly decided against)
- Any change to `AppSidebarLayout` or the desktop/mobile responsive sidebar behavior used elsewhere in the app
