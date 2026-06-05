export function ProgressBar({ progress }: { progress: number }) {
    return (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
            <div
                className="h-full bg-white/60"
                style={{
                    width: `${progress * 100}%`,
                    transition: 'width 0.1s linear',
                }}
            />
        </div>
    );
}
