import { Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import PasskeyList from '@/components/passkey-list';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import { edit } from '@/routes/security';

type Passkey = {
    id: string;
    name: string;
    last_used_at: string | null;
    created_at: string;
};

type Props = {
    passkeys?: Passkey[];
};

const EMPTY_PASSKEYS: Passkey[] = [];

export default function Security({ passkeys = EMPTY_PASSKEYS }: Props) {
    return (
        <SettingsPageLayout>
            <Head title="Security settings" />

            <h1 className="sr-only">Security settings</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Passkeys"
                    description="Manage passkeys for passwordless sign-in"
                />
                <PasskeyList passkeys={passkeys} />
            </div>
        </SettingsPageLayout>
    );
}

Security.layout = {
    breadcrumbs: [
        {
            title: 'Security settings',
            href: edit(),
        },
    ],
};
