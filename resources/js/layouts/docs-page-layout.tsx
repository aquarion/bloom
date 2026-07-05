import type { PropsWithChildren } from 'react';

export default function DocsPageLayout({
    title,
    lastUpdated,
    children,
}: PropsWithChildren<{ title: string; lastUpdated?: string | null }>) {
    return (
        <div className="mx-auto max-w-prose px-4 py-10">
            <h1 className="mb-1 font-semibold text-2xl text-foreground">
                {title}
            </h1>
            {lastUpdated && (
                <p className="mb-8 text-muted-foreground text-sm">
                    Last updated {lastUpdated}
                </p>
            )}
            <div className="prose dark:prose-invert">{children}</div>
        </div>
    );
}
