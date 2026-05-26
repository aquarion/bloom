import { Form, Head } from '@inertiajs/react';
import { KeyRound } from 'lucide-react';
import { useEffect } from 'react';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { usePasskey } from '@/hooks/use-passkey';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
};

export default function Login({
    status,
    canResetPassword,
    canRegister,
}: Props) {
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

            <Form
                {...store.form()}
                resetOnSuccess={['password']}
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoFocus
                                    tabIndex={1}
                                    autoComplete="username webauthn"
                                    placeholder="email@example.com"
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">Password</Label>
                                    {canResetPassword && (
                                        <TextLink
                                            href={request()}
                                            className="ml-auto text-sm"
                                            tabIndex={5}
                                        >
                                            Forgot password?
                                        </TextLink>
                                    )}
                                </div>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    tabIndex={2}
                                    autoComplete="current-password"
                                    placeholder="Password"
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="remember"
                                    name="remember"
                                    tabIndex={3}
                                />
                                <Label htmlFor="remember">Remember me</Label>
                            </div>

                            <Button
                                type="submit"
                                className="mt-4 w-full"
                                tabIndex={4}
                                disabled={processing}
                                data-test="login-button"
                            >
                                {processing && <Spinner />}
                                Log in
                            </Button>

                            {isSupported && (
                                <>
                                    <div className="relative flex items-center gap-3">
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-sm text-muted-foreground">
                                            or
                                        </span>
                                        <div className="h-px flex-1 bg-border" />
                                    </div>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        tabIndex={6}
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

                                    {passkeyError && (
                                        <InputError message={passkeyError} />
                                    )}
                                </>
                            )}
                        </div>

                        {canRegister && (
                            <div className="text-center text-sm text-muted-foreground">
                                Don't have an account?{' '}
                                <TextLink href={register()} tabIndex={7}>
                                    Sign up
                                </TextLink>
                            </div>
                        )}
                    </>
                )}
            </Form>

            {status && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {status}
                </div>
            )}
        </>
    );
}

Login.layout = {
    title: 'Log in to your account',
    description: 'Enter your email and password below to log in',
};
