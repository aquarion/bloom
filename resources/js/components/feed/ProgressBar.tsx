type ProgressBarProps =
    | { progress: number; segments?: never }
    | {
          segments: { count: number; activeIndex: number; elapsed: number };
          progress?: never;
      };

export function ProgressBar({ progress, segments }: ProgressBarProps) {
    if (segments) {
        return (
            <div className="absolute right-0 bottom-0 left-0 flex h-0.5 gap-px">
                {Array.from({ length: segments.count }, (_, i) => (
                    <div key={i} className="flex-1 overflow-hidden bg-white/20">
                        <div
                            className="h-full bg-white/60"
                            style={{
                                width:
                                    i < segments.activeIndex
                                        ? '0%'
                                        : i === segments.activeIndex
                                          ? `${(1 - segments.elapsed) * 100}%`
                                          : '100%',
                                transition: 'width 0.1s linear',
                            }}
                        />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-white/10">
            <div
                className="h-full bg-white/60"
                style={{
                    width: `${(progress ?? 1) * 100}%`,
                    transition: 'width 0.1s linear',
                }}
            />
        </div>
    );
}
