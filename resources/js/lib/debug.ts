/**
 * Debug utilities exposed to window for console access
 * Only available when APP_DEBUG=true
 */

interface DebugFeedStore {
    current: unknown;
    queue: unknown[];
    cursor: string | null;
}

interface DebugWindow {
    __APP_DEBUG?: boolean;
    __DEBUG?: {
        _feedStore?: DebugFeedStore;
        dumpFeedQueue(): void;
        inspectPost(index: number): void;
        exportPosts(): void;
    };
}

const debugWindow = (): Window & DebugWindow => window as Window & DebugWindow;

export function setupDebugWindow() {
    if (!debugWindow().__APP_DEBUG) {
        return;
    }

    debugWindow().__DEBUG = {
        dumpFeedQueue() {
            const store = debugWindow().__DEBUG?._feedStore;

            if (!store) {
                console.warn(
                    'Feed store not initialized. Make sure you call registerFeedDebug() from Feed.tsx',
                );

                return;
            }

            console.group('📺 Feed Queue State');
            console.log('Current post:', store.current);
            console.log('Queue length:', store.queue.length);
            console.table(store.queue);
            console.log('Cursor:', store.cursor);
            console.groupEnd();
        },

        inspectPost(index: number) {
            const store = debugWindow().__DEBUG?._feedStore;

            if (!store?.queue[index]) {
                console.warn(`Post at index ${index} not found`);

                return;
            }

            console.group(`📄 Post #${index}`);
            console.table(store.queue[index]);
            console.groupEnd();
        },

        exportPosts() {
            const store = debugWindow().__DEBUG?._feedStore;

            if (!store) {
                console.warn('Feed store not initialized');

                return;
            }

            const all = store.current
                ? [store.current, ...store.queue]
                : store.queue;
            const json = JSON.stringify(all, null, 2);
            console.log(json);
            navigator.clipboard.writeText(json).then(() => {
                console.log('✅ Copied to clipboard!');
            });
        },
    };
}

/**
 * Register feed state with debug utilities
 * Call this from your Feed component
 */
export function registerFeedDebug(state: DebugFeedStore) {
    if (!debugWindow().__APP_DEBUG) {
        return;
    }

    const debug = debugWindow().__DEBUG;

    if (debug) {
        debug._feedStore = state;
    }
}
