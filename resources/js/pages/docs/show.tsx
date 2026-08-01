import { Head, Link } from '@inertiajs/react';
import DocsLayout from '@/layouts/docs-layout';
import DocsPageLayout from '@/layouts/docs-page-layout';
import docs from '@/routes/docs';

const LEGAL_DOCS = [
    { title: 'Privacy Policy', slug: 'privacy' },
    { title: 'Cookie Policy', slug: 'cookies' },
    { title: 'Legal Changes', slug: 'legal-changes' },
] as const;

function LegalDocsSubnav({ activeSlug }: { activeSlug: string }) {
    return (
        <nav
            aria-label="Legal documents"
            className="inline-flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800"
        >
            {LEGAL_DOCS.map(({ title, slug }) => (
                <Link
                    key={slug}
                    href={docs.show(slug)}
                    aria-current={slug === activeSlug ? 'page' : undefined}
                    className={`rounded-md px-3.5 py-1.5 text-sm transition-colors ${
                        slug === activeSlug
                            ? 'bg-white shadow-xs dark:bg-neutral-700 dark:text-neutral-100'
                            : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-700/60'
                    }`}
                >
                    {title}
                </Link>
            ))}
        </nav>
    );
}

export default function Show({
    slug,
    title,
    content,
    last_updated,
}: {
    slug: string;
    title: string;
    content: string;
    last_updated?: string | null;
}) {
    const isLegalDoc = LEGAL_DOCS.some((doc) => doc.slug === slug);

    return (
        <DocsLayout>
            <Head title={title} />
            <DocsPageLayout
                title={title}
                lastUpdated={last_updated}
                subnav={isLegalDoc && <LegalDocsSubnav activeSlug={slug} />}
            >
                {/* content is server-rendered HTML from our own Markdown files */}
                <div dangerouslySetInnerHTML={{ __html: content }} />
            </DocsPageLayout>
        </DocsLayout>
    );
}
