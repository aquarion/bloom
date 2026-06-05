import { Head } from '@inertiajs/react';
import Heading from '@/components/heading';
import PasskeyList from '@/components/passkey-list';
import { edit } from '@/routes/security';

type Props = {
    passkeys?: Array<{
        id: string;
        name: string;
        last_used_at: string | null;
        created_at: string;
    }>;
};

export default function Security({ passkeys = [] }: Props) {
    return (
        <>
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
        </>
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
