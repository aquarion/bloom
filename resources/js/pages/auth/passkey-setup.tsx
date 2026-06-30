import { Head, router, usePage } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePasskey } from '@/hooks/use-passkey';
import { trackGoal } from '@/lib/matomo';
import { dashboard } from '@/routes';

type Props = {
    status?: string;
};

export default function PasskeySetup({ status }: Props) {
    const { matomo } = usePage().props;
    const { isSupported, loading, error, register } = usePasskey();

    const isRecovery = status === 'recovery';

    const handleSetup = async () => {
        const ok = await register('My passkey');

        if (ok) {
            if (matomo && !isRecovery) {
                trackGoal(matomo.goals.registration);
            }

            router.visit(dashboard.url());
        }
    };

    return (
        <>
            <Head title="Set up a passkey" />

            <div className="flex flex-col items-center gap-6 text-center">
                <KeyRound className="h-12 w-12 text-primary" />

                <div className="space-y-2">
                    <h1 className="font-semibold text-2xl">
                        {isRecovery ? 'Add a new passkey' : 'Set up a passkey'}
                    </h1>
                    <p className="max-w-sm text-muted-foreground text-sm">
                        {isRecovery
                            ? 'Your recovery link was verified. Add a passkey to regain access to your account.'
                            : 'Passkeys let you sign in with your fingerprint, face, or device PIN. You must add a passkey to access your account.'}
                    </p>
                </div>

                {error && <p className="text-destructive text-sm">{error}</p>}

                {isSupported ? (
                    <Button
                        onClick={handleSetup}
                        disabled={loading}
                        className="w-full max-w-xs"
                    >
                        {loading ? (
                            <Spinner />
                        ) : (
                            <KeyRound className="h-4 w-4" />
                        )}
                        {loading ? 'Setting up…' : 'Set up passkey'}
                    </Button>
                ) : (
                    <p className="text-muted-foreground text-sm">
                        Your browser does not support passkeys. Please use a
                        modern browser.
                    </p>
                )}
            </div>
        </>
    );
}

PasskeySetup.layout = {
    title: 'One more step',
    description: 'Add a passkey to secure your account',
};
