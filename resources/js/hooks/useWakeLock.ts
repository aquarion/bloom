import { useEffect, useRef, useState } from 'react';

export function useWakeLock() {
    const [isActive, setIsActive] = useState(false);
    const sentinelRef = useRef<any>(null);

    useEffect(() => {
        if (!('wakeLock' in navigator)) {
            return;
        }

        async function requestWakeLock() {
            try {
                if (sentinelRef.current) {
                    return;
                }

                const sentinel = await navigator.wakeLock.request('screen');
                sentinelRef.current = sentinel;
                setIsActive(true);

                sentinel.addEventListener('release', () => {
                    sentinelRef.current = null;
                    setIsActive(false);
                });
            } catch (err) {
                console.warn('Failed to acquire screen wake lock:', err);
                setIsActive(false);
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
                setIsActive(false);
            }
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        requestWakeLock();

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
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
