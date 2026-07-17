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
import { Spinner } from '@/components/ui/spinner';

type TombstoneProps = {
    name: string;
    email: string;
};

const GENERIC_ERROR_MESSAGE =
    'Something went wrong. Your session may have expired — please refresh the page and try again.';

export default function Tombstone({ name, email }: TombstoneProps) {
    const [resurrecting, setResurrecting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleResurrect = () => {
        setResurrecting(true);
        setError(null);
        router.post(
            TombstoneController.resurrect.url(),
            {},
            {
                onError: () => setError(GENERIC_ERROR_MESSAGE),
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
                    {name}'s account ({email}) was archived after a long period
                    of inactivity. You can bring it back as a fresh account —
                    you'll need to reconnect your social feeds — or delete it
                    for good.
                </p>

                {error && <InputError message={error} />}

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
