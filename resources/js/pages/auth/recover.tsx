import { Form, Head } from '@inertiajs/react';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { login } from '@/routes';
import { store } from '@/routes/passkey/recover';

export default function Recover() {
    return (
        <>
            <Head title="Recover account" />
            <Form
                {...store.form()}
                disableWhileProcessing
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email address</Label>
                            <Input
                                id="email"
                                type="email"
                                name="email"
                                required
                                autoFocus
                                tabIndex={0}
                                autoComplete="email"
                                placeholder="email@example.com"
                            />
                            <InputError message={errors.email} />
                        </div>

                        <Button type="submit" disabled={processing}>
                            {processing && <Spinner />}
                            Send recovery link
                        </Button>

                        <div className="text-center text-sm text-muted-foreground">
                            <TextLink href={login()}>Back to sign in</TextLink>
                        </div>
                    </>
                )}
            </Form>
        </>
    );
}

Recover.layout = {
    title: 'Lost your passkey?',
    description: "Enter your email and we'll send you a recovery link",
};
