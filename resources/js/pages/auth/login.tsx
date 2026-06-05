import { Head } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { usePasskey } from '@/hooks/use-passkey';
import { register } from '@/routes';
import { recover as recoverUrl } from '@/routes/passkey';

type Props = {
    status?: string;
};

export default function Login({ status }: Props) {
    const {
        isSupported,
        loading,
        error: passkeyError,
        authenticate,
        startConditional,
        abortConditional,
    } = usePasskey();

    useEffect(() => {
        if (isSupported) {
            startConditional();

            return abortConditional;
        }
    }, [isSupported, startConditional, abortConditional]);

    return (
        <>
            <Head title="Log in" />

            <div className="flex flex-col gap-6">
                {isSupported ? (
                    <Button
                        type="button"
                        className="w-full"
                        disabled={loading}
                        onClick={authenticate}
                        data-test="passkey-login-button"
                    >
                        {loading ? (
                            <Spinner />
                        ) : (
                            <KeyRound className="h-4 w-4" />
                        )}
                        Sign in with passkey
                    </Button>
                ) : (
                    <p className="text-center text-muted-foreground text-sm">
                        Your browser does not support passkeys. Please use a
                        modern browser.
                    </p>
                )}

                {passkeyError && <InputError message={passkeyError} />}

                {status && (
                    <p className="text-center font-medium text-green-600 text-sm">
                        {status}
                    </p>
                )}

                <div className="text-center text-muted-foreground text-sm">
                    Don't have an account?{' '}
                    <TextLink href={register()} tabIndex={0}>
                        Sign up
                    </TextLink>
                </div>

                <div className="text-center text-muted-foreground text-sm">
                    <TextLink href={recoverUrl()} tabIndex={0}>
                        Lost your passkey?
                    </TextLink>
                </div>
            </div>
        </>
    );
}

Login.layout = {
    title: 'Log in to your account',
    description: 'Use your passkey to sign in securely',
};
