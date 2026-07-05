import { Link, router, usePage } from '@inertiajs/react';
import {
    CircleAlert,
    FolderGit2,
    LogOut,
    Palette,
    Rss,
    ShieldCheck,
    SlidersHorizontal,
    User,
    Users,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import {
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { UserInfo } from '@/components/user-info';
import { useMobileNavigation } from '@/hooks/use-mobile-navigation';
import { feed, logout } from '@/routes';
import { edit as appearanceEdit } from '@/routes/appearance';
import { edit as connectionsEdit } from '@/routes/connections';
import { show as docsShow } from '@/routes/docs';
import { edit as feedSettingsEdit } from '@/routes/feed/settings';
import { edit as profileEdit } from '@/routes/profile';
import { edit as securityEdit } from '@/routes/security';
import type { NavItem } from '@/types';

const docsNavLinks = [
    { title: 'Privacy Policy', slug: 'privacy' },
    { title: 'Cookie Policy', slug: 'cookies' },
    { title: 'Changelog', slug: 'changelog' },
    { title: 'Legal Changes', slug: 'legal-changes' },
] as const;

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        href: 'https://github.com/aquarion/bloom',
        icon: FolderGit2,
    },
    {
        title: 'Report an issue',
        href: 'https://github.com/aquarion/bloom/issues/new',
        icon: CircleAlert,
    },
];

const platformNavItems: NavItem[] = [
    {
        title: 'Feed',
        href: feed(),
        icon: Rss,
    },
    {
        title: 'Accounts',
        href: connectionsEdit(),
        icon: Users,
    },
    {
        title: 'Feed Settings',
        href: feedSettingsEdit(),
        icon: SlidersHorizontal,
    },
];

const settingsNavItems: NavItem[] = [
    {
        title: 'Profile',
        href: profileEdit(),
        icon: User,
    },
    {
        title: 'Security',
        href: securityEdit(),
        icon: ShieldCheck,
    },
    {
        title: 'Appearance',
        href: appearanceEdit(),
        icon: Palette,
    },
];

export function AppSidebarContents() {
    const { auth, appVersion } = usePage().props;
    const cleanup = useMobileNavigation();

    const handleLogout = () => {
        cleanup();
        router.flushAll();
    };

    return (
        <>
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={feed()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
                {auth.user && (
                    <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
                        <UserInfo user={auth.user} showEmail />
                    </div>
                )}
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={platformNavItems} />
                <NavMain items={settingsNavItems} label="Settings" />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                {appVersion && (
                    <div className="px-3 pb-1 text-neutral-500 text-xs group-data-[collapsible=icon]:hidden dark:text-neutral-400">
                        {appVersion.url ? (
                            <a
                                href={appVersion.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline"
                            >
                                {appVersion.label}
                            </a>
                        ) : (
                            <span>{appVersion.label}</span>
                        )}
                    </div>
                )}
                <SidebarMenu className="group-data-[collapsible=icon]:hidden">
                    {docsNavLinks.map(({ title, slug }) => (
                        <SidebarMenuItem key={slug}>
                            <SidebarMenuButton asChild size="sm">
                                <Link
                                    href={docsShow(slug)}
                                    className="text-neutral-500 text-xs dark:text-neutral-400"
                                >
                                    <span>{title}</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ))}
                </SidebarMenu>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                            <Link
                                href={logout()}
                                method="post"
                                as="button"
                                onClick={handleLogout}
                                data-test="logout-button"
                            >
                                <LogOut />
                                <span>Log out</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </>
    );
}
