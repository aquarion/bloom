import type { CSSProperties } from 'react';
import { AppSidebarContents } from '@/components/app-sidebar-contents';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { SidebarProvider } from '@/components/ui/sidebar';

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function FeedSidebarPanel({ open, onOpenChange }: Props) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="left"
                className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
                style={{ '--sidebar-width': '18rem' } as CSSProperties}
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>Navigation</SheetTitle>
                    <SheetDescription>App navigation</SheetDescription>
                </SheetHeader>
                <SidebarProvider>
                    <div className="flex h-full flex-col">
                        <AppSidebarContents />
                    </div>
                </SidebarProvider>
            </SheetContent>
        </Sheet>
    );
}
