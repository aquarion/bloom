import type { PropsWithChildren } from 'react';

export default function SettingsPageLayout({ children }: PropsWithChildren) {
    return <div className="max-w-2xl space-y-12 px-4 py-6">{children}</div>;
}
