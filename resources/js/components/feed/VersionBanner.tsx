export function VersionBanner({
    appVersion,
}: {
    appVersion: { label: string; url: string | null };
}) {
    return (
        <div className="ml-auto shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-white/50 text-xs">
            {appVersion.url ? (
                <a
                    href={appVersion.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white hover:underline"
                >
                    {appVersion.label}
                </a>
            ) : (
                <span>{appVersion.label}</span>
            )}
        </div>
    );
}
