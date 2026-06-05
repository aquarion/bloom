import { Head } from '@inertiajs/react';
import { XCircle } from 'lucide-react';
import TextLink from '@/components/text-link';
import { recover } from '@/routes/passkey';

export default function RecoverInvalid() {
    return (
        <>
            <Head title="Link expired" />
            <div className="flex flex-col items-center gap-4 text-center">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-sm text-muted-foreground">
                    This recovery link has expired or already been used.
                </p>
                <TextLink href={recover()}>
                    Request a new recovery link
                </TextLink>
            </div>
        </>
    );
}

RecoverInvalid.layout = {
    title: 'Link expired',
    description: 'This recovery link is no longer valid',
};
