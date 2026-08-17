import { Head, useForm, usePage } from '@inertiajs/react';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePasskey } from '@/hooks/use-passkey';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import { edit } from '@/routes/profile';

export default function Profile({ status }: { status?: string }) {
    const { auth } = usePage().props;
    const { confirmIfNeeded, error: passkeyError } = usePasskey();

    const profileForm = useForm({
        name: auth.user.name,
        email: auth.user.email,
    });

    // The step-up middleware rejects with a `passkey` error key that isn't one of
    // this form's fields, so read it off the untyped error bag.
    const stepUpError = (profileForm.errors as Record<string, string>).passkey;

    async function submitProfile(e: React.FormEvent) {
        e.preventDefault();

        // Changing your name/email is a step-up action, but a passkey confirmed
        // within the last 15 minutes is reused rather than prompting again.
        if (!(await confirmIfNeeded())) {
            return;
        }

        profileForm.patch(ProfileController.update.url(), {
            preserveScroll: true,
        });
    }

    return (
        <SettingsPageLayout>
            <Head title="Profile settings" />

            <h1 className="sr-only">Profile settings</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Profile information"
                    description="Update your name and email address"
                />

                <form onSubmit={submitProfile} className="space-y-6">
                    <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>

                        <Input
                            id="name"
                            className="mt-1 block w-full"
                            value={profileForm.data.name}
                            onChange={(e) =>
                                profileForm.setData('name', e.target.value)
                            }
                            name="name"
                            required
                            autoComplete="name"
                            placeholder="Full name"
                        />

                        <InputError
                            className="mt-2"
                            message={profileForm.errors.name}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="email">Email address</Label>

                        <Input
                            id="email"
                            type="email"
                            className="mt-1 block w-full"
                            value={profileForm.data.email}
                            onChange={(e) =>
                                profileForm.setData('email', e.target.value)
                            }
                            name="email"
                            required
                            autoComplete="username"
                            placeholder="Email address"
                        />

                        <InputError
                            className="mt-2"
                            message={profileForm.errors.email}
                        />
                    </div>

                    {passkeyError && (
                        <InputError className="mt-2" message={passkeyError} />
                    )}

                    {/* Server-side step-up rejection (e.g. the client thought a
                        confirmation was still valid but the server disagreed). */}
                    {stepUpError && (
                        <InputError className="mt-2" message={stepUpError} />
                    )}

                    {status && (
                        <p className="font-medium text-green-600 text-sm">
                            {status}
                        </p>
                    )}

                    <div className="flex items-center gap-4">
                        <Button
                            disabled={profileForm.processing}
                            data-test="update-profile-button"
                        >
                            Save
                        </Button>
                    </div>
                </form>
            </div>

            <DeleteUser />
        </SettingsPageLayout>
    );
}

Profile.layout = {
    breadcrumbs: [
        {
            title: 'Profile settings',
            href: edit(),
        },
    ],
};
