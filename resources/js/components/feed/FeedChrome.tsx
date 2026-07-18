import {
    AtSign,
    Eye,
    EyeOff,
    Pause,
    Play,
    SkipBack,
    SkipForward,
} from 'lucide-react';
import { Attribution } from '@/components/feed/Attribution';
import { DebugPanel } from '@/components/feed/DebugPanel';
import { FeedSidebarPanel } from '@/components/feed/FeedSidebarPanel';
import { KeyboardShortcutsOverlay } from '@/components/feed/KeyboardShortcutsOverlay';
import { MentionChips } from '@/components/feed/MentionChips';
import { NavMenuIcon } from '@/components/feed/NavMenuIcon';
import { ProgressBar } from '@/components/feed/ProgressBar';
import { SourceBadge } from '@/components/feed/SourceBadge';
import type { Post } from '@/types/post';

export function FeedChrome({
    current,
    queue,
    debugEnabled,
    panelOpen,
    onTogglePanel,
    onPanelOpenChange,
    wakeLockSupported,
    wakeLockActive,
    onToggleWakeLock,
    canGoBack,
    onGoBack,
    paused,
    onTogglePause,
    onAdvance,
    carouselProgress,
    progress,
    showHelp,
}: {
    current: Post;
    queue: Post[];
    debugEnabled: boolean;
    panelOpen: boolean;
    onTogglePanel: () => void;
    onPanelOpenChange: (open: boolean) => void;
    wakeLockSupported: boolean;
    wakeLockActive: boolean;
    onToggleWakeLock: () => void;
    canGoBack: boolean;
    onGoBack: () => void;
    paused: boolean;
    onTogglePause: () => void;
    onAdvance: () => void;
    carouselProgress: { activeIndex: number; elapsed: number } | null;
    progress: number;
    showHelp: boolean;
}) {
    return (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
            <div className="pointer-events-auto flex items-center gap-2 p-4">
                <button
                    type="button"
                    onClick={onTogglePanel}
                    className={`flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white ${panelOpen ? 'relative z-[51]' : ''}`}
                    aria-label="Open navigation"
                    aria-expanded={panelOpen}
                    aria-haspopup="dialog"
                >
                    <NavMenuIcon />
                </button>
                {wakeLockSupported && (
                    <button
                        type="button"
                        onClick={onToggleWakeLock}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                        aria-label={
                            wakeLockActive
                                ? 'Disable keep-awake'
                                : 'Enable keep-awake'
                        }
                        aria-pressed={wakeLockActive}
                    >
                        {wakeLockActive ? (
                            <Eye className="h-4 w-4" />
                        ) : (
                            <EyeOff className="h-4 w-4" />
                        )}
                    </button>
                )}
                {debugEnabled && <DebugPanel current={current} queue={queue} />}
                <SourceBadge post={current} />
            </div>

            <div className="flex-1" />

            <div className="pointer-events-auto flex items-center gap-2 px-4 pt-2 pb-3">
                <Attribution post={current} />
                {current.chip_mentions.length > 0 && (
                    <>
                        <AtSign className="size-4 flex-shrink-0 text-white/30" />
                        <MentionChips mentions={current.chip_mentions} />
                    </>
                )}
                <button
                    type="button"
                    onClick={onGoBack}
                    disabled={!canGoBack}
                    className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-white/10 disabled:hover:text-white/60"
                    aria-label="Previous"
                >
                    <SkipBack className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    onClick={onTogglePause}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                    aria-label={paused ? 'Resume' : 'Pause'}
                    aria-pressed={paused}
                >
                    {paused ? (
                        <Play className="h-4 w-4" />
                    ) : (
                        <Pause className="h-4 w-4" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={onAdvance}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
                    aria-label="Next"
                >
                    <SkipForward className="h-4 w-4" />
                </button>
            </div>

            {current.media.length > 0 ? (
                <ProgressBar
                    segments={{
                        count: current.media.length,
                        activeIndex: carouselProgress?.activeIndex ?? 0,
                        elapsed: carouselProgress?.elapsed ?? 0,
                    }}
                />
            ) : (
                <ProgressBar progress={progress} />
            )}
            <KeyboardShortcutsOverlay open={showHelp} />
            <FeedSidebarPanel
                open={panelOpen}
                onOpenChange={onPanelOpenChange}
            />
        </div>
    );
}
