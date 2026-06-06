import { useEffect, useRef, useState } from 'react';

export function useWakeLock() {
    const [isActive, setIsActive] = useState(false);
    const sentinelRef = useRef<any>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;

        if (!('wakeLock' in navigator)) {
            return;
        }

        async function requestWakeLock() {
            try {
                if (sentinelRef.current) {
                    return;
                }

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

        if (document.visibilityState === 'visible') {
            requestWakeLock();
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
    }, []);

    return {
        isSupported: 'wakeLock' in navigator,
        isActive,
    };
}
