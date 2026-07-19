import { Head } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { FeedChrome } from '@/components/feed/FeedChrome';
import { PostBackground } from '@/components/feed/PostBackground';
import { PostContent } from '@/components/feed/PostContent';
import { useAutoAdvance } from '@/hooks/useAutoAdvance';
import { CwStateProvider, useCwState } from '@/hooks/useCwState';
import { shouldShowCwOverlay } from '@/lib/cw';
import { useFeedQueue } from '@/hooks/useFeedQueue';
import { useFeedTransition } from '@/hooks/useFeedTransition';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useWakeLock } from '@/hooks/useWakeLock';
import { registerFeedDebug, setupDebugWindow } from '@/lib/debug';
import type { Post } from '@/types/post';

function extractFirstLink(html: string): string | null {
    const match = html.match(/href="([^"]+)"/);

    return match?.[1] ?? null;
}

export default function Feed(props: {
    initialPosts: Post[];
    initialCursor: string | null;
    debugEnabled: boolean;
    cwBehavior: 'skip' | 'blur' | 'show';
    sensitiveMediaBehavior: 'skip' | 'blur' | 'show';
}) {
    return (
        <CwStateProvider>
            <FeedView {...props} />
        </CwStateProvider>
    );
}

function FeedView({
    initialPosts,
    initialCursor,
    debugEnabled,
    cwBehavior,
    sensitiveMediaBehavior,
}: {
    initialPosts: Post[];
    initialCursor: string | null;
    debugEnabled: boolean;
    cwBehavior: 'skip' | 'blur' | 'show';
    sensitiveMediaBehavior: 'skip' | 'blur' | 'show';
}) {
    const { current, advance, queue, goBack, canGoBack } = useFeedQueue({
        initialPosts,
        initialCursor,
        cwBehavior,
        sensitiveMediaBehavior,
    });
    const [paused, setPaused] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);
    const { isRevealed } = useCwState();

    const {
        isSupported: wakeLockSupported,
        isActive: wakeLockActive,
        toggle: toggleWakeLock,
    } = useWakeLock();
    const [readyForPostId, setReadyForPostId] = useState<string | null>(null);
    const animationReady = readyForPostId === current?.id;

    const {
        bgRef,
        contentRef,
        nextBackground,
        carouselProgress,
        handleAdvance,
        handleCarouselProgress,
        resetCarouselProgress,
    } = useFeedTransition({ current, queue, advance, initialPosts });

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
            cursor: initialCursor,
        });
    }, [current, queue, initialCursor]);

    const handleGoBack = () => {
        goBack();
        resetCarouselProgress();
        setPaused(true);
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

    const overlayActive = current
        ? shouldShowCwOverlay(
              current,
              cwBehavior,
              sensitiveMediaBehavior,
              isRevealed,
          )
        : false;

    const { progress } = useAutoAdvance({
        duration: 8000,
        paused: paused || !animationReady || overlayActive,
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
                            current.media.length > 0
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
                    carouselProgress={carouselProgress}
                    progress={progress}
                    showHelp={showHelp}
                    cwBehavior={cwBehavior}
                />
            </div>
        </>
    );
}
