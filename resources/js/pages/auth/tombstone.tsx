import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import TombstoneController from '@/actions/App/Http/Controllers/Auth/TombstoneController';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';

type TombstoneProps = {
    name: string;
};

const GENERIC_ERROR_MESSAGE =
    'Something went wrong. Your session may have expired — please refresh the page and try again.';

export default function Tombstone({ name }: TombstoneProps) {
    const [resurrecting, setResurrecting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState<string | null>(null);

    const handleResurrect = () => {
        setResurrecting(true);
        setError(null);
        setEmailError(null);
        router.post(
            TombstoneController.resurrect.url(),
            { email },
            {
                onError: (errors: Record<string, string>) => {
                    if (errors.email) {
                        setEmailError(errors.email);
                    } else {
                        setError(GENERIC_ERROR_MESSAGE);
                    }
                },
                onFinish: () => setResurrecting(false),
            },
        );
    };

    const handleDelete = () => {
        setDeleting(true);
        setError(null);
        router.delete(TombstoneController.destroy.url(), {
            onError: () => setError(GENERIC_ERROR_MESSAGE),
            onFinish: () => setDeleting(false),
        });
    };

    return (
        <>
            <Head title="Account archived" />
            <div className="flex flex-col gap-6 text-center">
                <p className="text-muted-foreground text-sm">
                    {name}'s account was archived after a long period of
                    inactivity. You can bring it back as a fresh account —
                    you'll need to reconnect your social feeds — or delete it
                    for good.
                </p>

                {error && <InputError message={error} />}

                <div className="grid gap-2 text-left">
                    <Label htmlFor="email">Confirm your email address</Label>
                    <Input
                        id="email"
                        type="email"
                        name="email"
                        required
                        autoComplete="email"
                        placeholder="email@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={resurrecting || deleting}
                        data-test="resurrect-email-input"
                    />
                    <InputError message={emailError ?? undefined} />
                </div>

                <Button
                    onClick={handleResurrect}
                    disabled={resurrecting || deleting}
                    data-test="resurrect-account-button"
                >
                    {resurrecting && <Spinner />}
                    Bring my account back
                </Button>

                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="destructive"
                            disabled={resurrecting || deleting}
                            data-test="delete-tombstone-button"
                        >
                            Delete permanently
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogTitle>
                            Delete this account permanently?
                        </DialogTitle>
                        <DialogDescription>
                            This cannot be undone. Your archived passkeys and
                            social account metadata will be permanently erased.
                        </DialogDescription>

                        <DialogFooter className="gap-2">
                            <DialogClose asChild>
                                <Button variant="secondary">Cancel</Button>
                            </DialogClose>

                            <Button
                                variant="destructive"
                                disabled={deleting}
                                onClick={handleDelete}
                                data-test="confirm-delete-tombstone-button"
                            >
                                {deleting && <Spinner />}
                                Delete permanently
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}

Tombstone.layout = {
    title: 'Account archived',
    description: 'This account was archived due to inactivity',
};
