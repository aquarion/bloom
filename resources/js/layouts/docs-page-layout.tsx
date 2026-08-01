import type { PropsWithChildren, ReactNode } from 'react';

export default function DocsPageLayout({
    title,
    lastUpdated,
    subnav,
    children,
}: PropsWithChildren<{
    title: string;
    lastUpdated?: string | null;
    /** Sibling-page tabs for docs that belong to a group (e.g. the legal docs). */
    subnav?: ReactNode;
}>) {
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
            {subnav && <div className="mb-8">{subnav}</div>}
            <div className="prose dark:prose-invert">{children}</div>
        </div>
    );
}
