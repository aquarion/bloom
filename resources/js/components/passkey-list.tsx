import { Form, router } from '@inertiajs/react';
import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { usePasskey } from '@/hooks/use-passkey';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { destroy } from '@/routes/passkey';

type PasskeyData = {
    id: string;
    name: string;
    last_used_at: string | null;
    created_at: string;
};

type Props = {
    passkeys: PasskeyData[];
};

export default function PasskeyList({ passkeys }: Props) {
    const { isSupported, loading, error, register } = usePasskey();
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');

    const handleAdd = async () => {
        if (!newName.trim()) return;
        const ok = await register(newName.trim());
        if (ok) {
            setAdding(false);
            setNewName('');
            router.reload({ only: ['passkeys'] });
        }
    };

    return (
        <div className="space-y-4">
            {passkeys.length === 0 && (
                <p className="text-sm text-muted-foreground">
                    No passkeys registered yet.
                </p>
            )}

            <ul className="space-y-2">
                {passkeys.map((pk) => (
                    <li
                        key={pk.id}
                        className="flex items-center justify-between rounded-md border px-4 py-3"
                    >
                        <div className="flex items-center gap-3">
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                            <div>
                                <p className="text-sm font-medium">{pk.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {pk.last_used_at
                                        ? `Last used ${new Date(pk.last_used_at).toLocaleDateString()}`
                                        : `Added ${new Date(pk.created_at).toLocaleDateString()}`}
                                </p>
                            </div>
                        </div>
                        <Form
                            method="delete"
                            action={destroy.url({ passkey: pk.id })}
                        >
                            {({ processing }) => (
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="icon"
                                    disabled={processing}
                                    aria-label={`Remove ${pk.name}`}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </Form>
                    </li>
                ))}
            </ul>

            {isSupported &&
                (adding ? (
                    <div className="flex items-end gap-2">
                        <div className="grid flex-1 gap-2">
                            <Label htmlFor="passkey-name">Passkey name</Label>
                            <Input
                                id="passkey-name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="e.g. iPhone 15"
                                autoFocus
                            />
                        </div>
                        <Button
                            onClick={handleAdd}
                            disabled={loading || !newName.trim()}
                        >
                            {loading ? 'Adding…' : 'Add'}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setAdding(false);
                                setNewName('');
                            }}
                        >
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <Button variant="outline" onClick={() => setAdding(true)}>
                        Add passkey
                    </Button>
                ))}

            {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
    );
}
