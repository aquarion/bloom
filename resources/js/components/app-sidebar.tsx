import { AppSidebarContents } from '@/components/app-sidebar-contents';
import { Sidebar } from '@/components/ui/sidebar';

export function AppSidebar() {
    return (
        <Sidebar collapsible="icon" variant="inset">
            <AppSidebarContents />
        </Sidebar>
    );
}
