import { useState } from 'react';

const SEEN_TIPS_KEY = 'bloom:seenTips:v1';

function readSeenTips(): Set<string> {
    try {
        return new Set<string>(
            JSON.parse(localStorage.getItem(SEEN_TIPS_KEY) ?? '[]'),
        );
    } catch {
        return new Set<string>();
    }
}

/**
 * Tracks help bubbles that should only ever be shown once per browser.
 * Call `trigger()` at the moment the tip becomes relevant (e.g. a reveal
 * action) — it shows the tip only the first time, for any given `tipId`.
 */
export function useOneTimeTip(tipId: string) {
    const [visible, setVisible] = useState(false);

    const trigger = () => {
        const seenTips = readSeenTips();

        if (seenTips.has(tipId)) {
            return;
        }

        seenTips.add(tipId);

        try {
            localStorage.setItem(SEEN_TIPS_KEY, JSON.stringify([...seenTips]));
        } catch {
            // localStorage unavailable (private mode) — the tip just won't persist as seen.
        }

        setVisible(true);
    };

    const dismiss = () => setVisible(false);

    return { visible, trigger, dismiss };
}
