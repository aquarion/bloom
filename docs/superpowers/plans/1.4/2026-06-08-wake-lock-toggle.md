# Wake Lock Toggle Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an eye-open/eye-closed toggle button next to the home button in the feed chrome that displays and controls the wake lock state.

**Architecture:** Extend `useWakeLock` with an internal `enabled` flag and a `toggle` function; re-run the effect when `enabled` changes so disabling releases the sentinel and re-enabling re-acquires it. Wire the toggle into `feed.tsx` with an `Eye`/`EyeOff` Lucide button.

**Tech Stack:** React, TypeScript, Lucide React, Vitest + @testing-library/react

---

## File Map

- Modify: `resources/js/hooks/useWakeLock.ts` — add `enabled` state + `toggle` return value
- Modify: `resources/js/hooks/useWakeLock.test.ts` — add tests for toggle behaviour
- Modify: `resources/js/pages/feed.tsx` — consume `toggle`/`isActive`, add button

---

### Task 1: Extend useWakeLock with toggle support

**Files:**
- Modify: `resources/js/hooks/useWakeLock.ts`
- Modify: `resources/js/hooks/useWakeLock.test.ts`

- [ ] **Step 1: Write failing tests for toggle behaviour**

Add these three tests inside the existing `describe('useWakeLock')` block in `resources/js/hooks/useWakeLock.test.ts`, after the last existing test:

```typescript
it('toggle disables the wake lock and releases the sentinel', async () => {
    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.isActive).toBe(true);

    await act(async () => {
        result.current.toggle();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRelease).toHaveBeenCalledOnce();
    expect(result.current.isActive).toBe(false);
});

it('toggle re-enables the wake lock and re-acquires the sentinel', async () => {
    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Disable
    await act(async () => {
        result.current.toggle();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    mockRequest.mockClear();

    // Re-enable
    await act(async () => {
        result.current.toggle();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRequest).toHaveBeenCalledWith('screen');
    expect(result.current.isActive).toBe(true);
});

it('does not re-acquire when disabled and page visibility changes to visible', async () => {
    const { result } = renderHook(() => useWakeLock());

    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Disable
    await act(async () => {
        result.current.toggle();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    mockRequest.mockClear();

    // Simulate tab hide then show
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.isActive).toBe(false);
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /home/aquarion/code/aquarion/bloom && npx vitest run resources/js/hooks/useWakeLock.test.ts
```

Expected: 3 new tests fail (toggle, toggle re-enables, no re-acquire when disabled).

- [ ] **Step 3: Implement toggle support in useWakeLock**

Replace the entire contents of `resources/js/hooks/useWakeLock.ts` with:

```typescript
import { useEffect, useRef, useState } from 'react';

export function useWakeLock() {
    const [isActive, setIsActive] = useState(false);
    const [enabled, setEnabled] = useState(true);
    const sentinelRef = useRef<any>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        if (!('wakeLock' in navigator)) {
            return;
        }

        async function requestWakeLock() {
            if (!enabled || sentinelRef.current) {
                return;
            }

            try {
                const sentinel = await navigator.wakeLock.request('screen');

                if (!mountedRef.current) {
                    sentinel.release().catch((err) => {
                        console.warn(
                            'Failed to release screen wake lock after unmount:',
                            err,
                        );
                    });
                    return;
                }

                sentinelRef.current = sentinel;
                setIsActive(true);

                sentinel.addEventListener('release', () => {
                    sentinelRef.current = null;
                    if (mountedRef.current) {
                        setIsActive(false);
                    }
                });
            } catch (err) {
                console.warn('Failed to acquire screen wake lock:', err);
                if (mountedRef.current) {
                    setIsActive(false);
                }
            }
        }

        async function releaseWakeLock() {
            if (sentinelRef.current) {
                try {
                    await sentinelRef.current.release();
                } catch (err) {
                    console.warn('Failed to release screen wake lock:', err);
                }
                sentinelRef.current = null;
                if (mountedRef.current) {
                    setIsActive(false);
                }
            }
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            } else {
                releaseWakeLock();
            }
        };

        if (enabled && document.visibilityState === 'visible') {
            requestWakeLock();
        } else if (!enabled) {
            releaseWakeLock();
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            mountedRef.current = false;
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
            releaseWakeLock();
        };
    }, [enabled]);

    return {
        isSupported: 'wakeLock' in navigator,
        isActive,
        toggle: () => setEnabled((e) => !e),
    };
}
```

- [ ] **Step 4: Run all useWakeLock tests**

```bash
cd /home/aquarion/code/aquarion/bloom && npx vitest run resources/js/hooks/useWakeLock.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git checkout -b feature/wake-lock-toggle
git add resources/js/hooks/useWakeLock.ts resources/js/hooks/useWakeLock.test.ts
git commit -m "🎇 Add toggle to useWakeLock hook"
```

---

### Task 2: Add toggle button to feed chrome

**Files:**
- Modify: `resources/js/pages/feed.tsx`

- [ ] **Step 1: Add Eye/EyeOff to imports and wire up the hook**

In `resources/js/pages/feed.tsx`, update the lucide import line (line 3):

```typescript
import { Eye, EyeOff, Pause, Play } from 'lucide-react';
```

Update the `useWakeLock()` call (line 33) to capture its return values:

```typescript
const { isSupported: wakeLockSupported, isActive: wakeLockActive, toggle: toggleWakeLock } = useWakeLock();
```

- [ ] **Step 2: Add the toggle button to the chrome**

In the top chrome row (the `<div>` starting at line 164), add the button immediately after the closing `</Link>` tag for the home button (after line 183). Hidden when Wake Lock API is absent (`isSupported` false):

```tsx
{wakeLockSupported && (
    <button
        type="button"
        onClick={toggleWakeLock}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
        aria-label={wakeLockActive ? 'Disable keep-awake' : 'Enable keep-awake'}
    >
        {wakeLockActive ? (
            <Eye className="h-4 w-4" />
        ) : (
            <EyeOff className="h-4 w-4" />
        )}
    </button>
)}
```

- [ ] **Step 3: Run the full test suite**

```bash
cd /home/aquarion/code/aquarion/bloom && ./vendor/bin/pest && npx vitest run
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/feed.tsx
git commit -m "🖼️ Add wake lock toggle button to feed chrome"
```
