import { Head } from '@inertiajs/react';
import { MailCheck } from 'lucide-react';
import TextLink from '@/components/text-link';
import { login } from '@/routes';

export default function RecoverSent() {
    return (
        <>
            <Head title="Check your email" />
            <div className="flex flex-col items-center gap-4 text-center">
                <MailCheck className="h-12 w-12 text-primary" />
                <p className="text-sm text-muted-foreground">
                    If an account with that email exists, we've sent a recovery
                    link. Check your inbox and follow the link to add a new
                    passkey.
                </p>
                <TextLink href={login()}>Back to sign in</TextLink>
            </div>
        </>
    );
}

RecoverSent.layout = {
    title: 'Check your email',
    description: 'A recovery link has been sent if your email is registered',
};
