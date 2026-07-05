import { Link } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { home } from '@/routes';
import docs from '@/routes/docs';

export default function DocsLayout({ children }: PropsWithChildren) {
    return (
        <div className="flex min-h-svh flex-col bg-background">
            <header className="border-b px-6 py-4">
                <Link
                    href={home()}
                    className="inline-flex items-center gap-2 font-semibold text-sm hover:opacity-80"
                >
                    <AppLogoIcon className="size-5" aria-hidden="true" />
                    <span>Bloom</span>
                </Link>
            </header>

            <main className="flex-1">{children}</main>

            <footer className="border-t px-6 py-4">
                <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
                    <Link
                        href={docs.show('privacy')}
                        className="hover:underline"
                    >
                        Privacy Policy
                    </Link>
                    <Link
                        href={docs.show('cookies')}
                        className="hover:underline"
                    >
                        Cookie Policy
                    </Link>
                    <Link
                        href={docs.show('changelog')}
                        className="hover:underline"
                    >
                        Changelog
                    </Link>
                    <Link
                        href={docs.show('legal-changes')}
                        className="hover:underline"
                    >
                        Legal Changes
                    </Link>
                </nav>
            </footer>
        </div>
    );
}
