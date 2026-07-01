export function ProgressBar({
    progress,
    segments,
}: {
    progress?: number;
    segments?: { count: number; activeIndex: number; filled: number };
}) {
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
                                          ? `${(1 - segments.filled) * 100}%`
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
