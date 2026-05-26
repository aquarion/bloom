import { Head, router } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePasskey } from '@/hooks/use-passkey';
import { skip } from '@/routes/passkey/setup';

export default function PasskeySetup() {
    const { isSupported, loading, error, register } = usePasskey();

    const handleSetup = async () => {
        const ok = await register('My passkey');
        if (ok) {
            router.visit('/dashboard');
        }
    };

    return (
        <>
            <Head title="Set up a passkey" />

            <div className="flex flex-col items-center gap-6 text-center">
                <KeyRound className="h-12 w-12 text-primary" />

                <div className="space-y-2">
                    <h1 className="text-2xl font-semibold">Set up a passkey</h1>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        Passkeys let you sign in with your fingerprint, face, or
                        device PIN — no password needed next time.
                    </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <div className="flex w-full max-w-xs flex-col gap-3">
                    {isSupported && (
                        <Button onClick={handleSetup} disabled={loading}>
                            {loading ? (
                                <Spinner />
                            ) : (
                                <KeyRound className="h-4 w-4" />
                            )}
                            {loading ? 'Setting up…' : 'Set up passkey'}
                        </Button>
                    )}
                    <Button
                        variant="ghost"
                        onClick={() => router.post(skip.url())}
                    >
                        Skip for now
                    </Button>
                </div>
            </div>
        </>
    );
}

PasskeySetup.layout = {
    title: 'One more step',
    description: 'Add a passkey for faster, more secure sign-in',
};
