import { Head } from '@inertiajs/react';
import DocsLayout from '@/layouts/docs-layout';
import DocsPageLayout from '@/layouts/docs-page-layout';

export default function Show({
    title,
    content,
    last_updated,
}: {
    title: string;
    content: string;
    last_updated?: string | null;
}) {
    return (
        <DocsLayout>
            <Head title={title} />
            <DocsPageLayout title={title} lastUpdated={last_updated}>
                {/* content is server-rendered HTML from our own Markdown files */}
                <div dangerouslySetInnerHTML={{ __html: content }} />
            </DocsPageLayout>
        </DocsLayout>
    );
}
