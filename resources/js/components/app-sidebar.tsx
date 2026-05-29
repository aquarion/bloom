import { Link, usePage } from '@inertiajs/react';
import { CircleAlert, FolderGit2, LayoutGrid, Rss, Settings, Users } from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { dashboard, feed } from '@/routes';
import { edit as connectionsEdit } from '@/routes/connections';
import { edit as profileEdit } from '@/routes/profile';
import type { NavItem } from '@/types';

const footerNavItems: NavItem[] = [
    {
        title: 'Repository',
        href: 'https://github.com/aquarion/sprouter',
        icon: FolderGit2,
    },
    {
        title: 'Report an issue',
        href: 'https://github.com/aquarion/sprouter/issues/new',
        icon: CircleAlert,
    },
];

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: dashboard(),
        icon: LayoutGrid,
    },
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
        title: 'Settings',
        href: profileEdit(),
        icon: Settings,
    },
];

export function AppSidebar() {
    const { appVersion } = usePage().props;

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                {appVersion && (
                    <div className="group-data-[collapsible=icon]:hidden px-3 pb-1 text-xs text-neutral-500 dark:text-neutral-400">
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
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
