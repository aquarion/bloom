import { Head } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { BloomSpinner } from '@/components/feed/BloomSpinner';
import { FeedChrome } from '@/components/feed/FeedChrome';
import { PostBackground } from '@/components/feed/PostBackground';
import { PostContent } from '@/components/feed/PostContent';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { CwStateProvider } from '@/hooks/useCwState';
import { useFeedQueue } from '@/hooks/useFeedQueue';
import { useFeedTransition } from '@/hooks/useFeedTransition';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useWakeLock } from '@/hooks/useWakeLock';
import { registerFeedDebug, setupDebugWindow } from '@/lib/debug';
import { cn } from '@/lib/utils';

function extractFirstLink(html: string): string | null {
    const match = html.match(/href="([^"]+)"/);

    return match?.[1] ?? null;
}

export default function Feed(props: {
    accounts: { id: number }[];
    debugEnabled: boolean;
    cwBehavior: 'skip' | 'blur' | 'show';
    sensitiveMediaBehavior: 'skip' | 'blur' | 'show';
    cwAuthorWhitelist: string[];
}) {
    return (
        <CwStateProvider initialAuthorWhitelist={props.cwAuthorWhitelist}>
            <FeedView {...props} />
        </CwStateProvider>
    );
}

function FeedView({
    accounts,
    debugEnabled,
    cwBehavior,
    sensitiveMediaBehavior,
}: {
    accounts: { id: number }[];
    debugEnabled: boolean;
    cwBehavior: 'skip' | 'blur' | 'show';
    sensitiveMediaBehavior: 'skip' | 'blur' | 'show';
}) {
    const {
        current,
        advance,
        queue,
        goBack,
        skipTo,
        canGoBack,
        loadedAccounts,
        totalAccounts,
    } = useFeedQueue({ accounts, cwBehavior, sensitiveMediaBehavior });
    const [paused, setPaused] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);

    const {
        isSupported: wakeLockSupported,
        isActive: wakeLockActive,
        toggle: toggleWakeLock,
    } = useWakeLock();
    const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
    const animationReady = readyForPostId === current?.id;
    // readyForPostId is only ever set, never reset, so this stays true for good
    // once the first post has loaded.
    const initialLoadComplete = readyForPostId !== null;

    const {
        bgRef,
        contentRef,
        nextBackground,
        carouselProgress,
        handleAdvance,
        handleCarouselProgress,
        resetCarouselProgress,
        // Posts now always arrive asynchronously (one fetch per account), so
        // there's never a synchronously-available post to seed nextBackground
        // with here — it falls back to `current` via `nextBackground ?? current`
        // below until the first transition's onComplete populates it for real.
    } = useFeedTransition({ current, queue, advance, initialPosts: [] });

    useEffect(() => {
        if (debugEnabled) {
            (window as Window & { __APP_DEBUG?: boolean }).__APP_DEBUG = true;
            setupDebugWindow();
        }
    }, [debugEnabled]);

    useEffect(() => {
        registerFeedDebug({
            current,
            queue,
            cursor: null,
        });
    }, [current, queue]);

    const handleGoBack = () => {
        goBack();
        resetCarouselProgress();
        setPaused(true);
    };

    const handleSelectPost = (postId: string) => {
        if (postId === current?.id) {
            return;
        }

        skipTo(postId);
        handleAdvance();
    };

    const openPost = () => {
        if (current) {
            window.open(current.original_url, '_blank', 'noopener,noreferrer');
        }
    };

    const openLink = () => {
        if (!current) {
            return;
        }

        const url = current.link_url ?? extractFirstLink(current.body);

        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const togglePause = () => setPaused((p) => !p);
    const togglePanel = () => setPanelOpen((o) => !o);
    const toggleHelp = () => setShowHelp((s) => !s);
    const closeHelp = () => setShowHelp(false);
    const closePanel = () => setPanelOpen(false);
    const handleEscape = () => {
        closePanel();
        closeHelp();
    };

    const { progress } = useAutoAdvance({
        duration: 8000,
        paused: paused || !animationReady,
        onAdvance: handleAdvance,
    });

    useKeyboardShortcuts({
        j: handleAdvance,
        k: handleGoBack,
        ' ': togglePause,
        o: openPost,
        l: openLink,
        '?': toggleHelp,
        h: togglePanel,
        Escape: handleEscape,
    });

    if (!current) {
        // Still waiting on one or more accounts' initial fetch — show real
        // progress rather than an indefinite spinner. Once every account has
        // reported in with nothing to show, this is a genuinely empty feed.
        if (totalAccounts > 0 && loadedAccounts < totalAccounts) {
            return (
                <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black text-white">
                    <BloomSpinner className="size-8 text-white/70" />
                    <p className="text-sm opacity-50">
                        Loading posts… ({loadedAccounts} of {totalAccounts})
                    </p>
                </div>
            );
        }

        return (
            <div className="flex h-screen items-center justify-center bg-black text-white">
                <p className="text-sm opacity-50">
                    No posts — connect an account in Settings.
                </p>
            </div>
        );
    }

    return (
        <>
            <Head title="Feed" />
            <div className="relative h-screen w-screen overflow-hidden bg-black">
                {/* Background layer: bottom slot pre-renders next post's background */}
                <div className="absolute inset-0 z-0">
                    <PostBackground post={nextBackground ?? current} />
                    <div ref={bgRef} className="absolute inset-0 bg-black">
                        <PostBackground post={current} />
                    </div>
                </div>

                {/* Content layer: zoom/blur transition */}
                <div ref={contentRef} className="absolute inset-0 z-10">
                    <PostContent
                        key={current.id}
                        post={current}
                        onReady={() => setReadyForPostId(current.id)}
                        onAdvance={handleAdvance}
                        onProgress={
                            current.media.length > 0 || current.thread
                                ? handleCarouselProgress
                                : undefined
                        }
                        cwBehavior={cwBehavior}
                        sensitiveMediaBehavior={sensitiveMediaBehavior}
                        paused={paused}
                    />
                </div>

                {/* Chrome layer: never transitions */}
                <FeedChrome
                    current={current}
                    queue={queue}
                    debugEnabled={debugEnabled}
                    panelOpen={panelOpen}
                    onTogglePanel={togglePanel}
                    onPanelOpenChange={setPanelOpen}
                    wakeLockSupported={wakeLockSupported}
                    wakeLockActive={wakeLockActive}
                    onToggleWakeLock={toggleWakeLock}
                    canGoBack={canGoBack}
                    onGoBack={handleGoBack}
                    paused={paused}
                    onTogglePause={togglePause}
                    onAdvance={handleAdvance}
                    onSelectPost={handleSelectPost}
                    carouselProgress={carouselProgress}
                    progress={progress}
                    showHelp={showHelp}
                    cwBehavior={cwBehavior}
                />

                {/* Loading overlay: covers the first post's load, then fades out for good */}
                <div
                    data-testid="initial-load-overlay"
                    aria-hidden={initialLoadComplete}
                    className={cn(
                        'absolute inset-0 z-20 flex items-center justify-center bg-black transition-opacity duration-300',
                        initialLoadComplete
                            ? 'pointer-events-none opacity-0'
                            : 'pointer-events-auto opacity-100',
                    )}
                >
                    <BloomSpinner className="size-8 text-white/70" />
                </div>
            </div>
        </>
    );
}
