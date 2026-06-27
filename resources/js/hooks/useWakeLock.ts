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

                // If the hook has unmounted while the request was in flight,
                // release the sentinel immediately to avoid leaking the wake lock.
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

                // eslint-disable-next-line @eslint-react/web-api-no-leaked-event-listener -- WakeLockSentinel fires once and is then invalid; no removeEventListener possible
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
            const sentinel = sentinelRef.current;

            if (!sentinel) {
                return;
            }

            sentinelRef.current = null;

            try {
                await sentinel.release();
            } catch (err) {
                console.warn('Failed to release screen wake lock:', err);
            }

            if (mountedRef.current) {
                setIsActive(false);
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
