import { useEffect, useRef } from 'react';

type ShortcutMap = Record<string, () => void>;

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
    const shortcutsRef = useRef(shortcuts);

    useEffect(() => {
        shortcutsRef.current = shortcuts;
    });

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            if (FORM_TAGS.has(target.tagName) || target.isContentEditable) {
                return;
            }
            const handler = shortcutsRef.current[e.key];
            if (handler) {
                e.preventDefault();
                handler();
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
}
