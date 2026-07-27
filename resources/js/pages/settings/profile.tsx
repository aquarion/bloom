import { Head, Link, useForm, usePage } from '@inertiajs/react';
import BetaTesterController from '@/actions/App/Http/Controllers/Settings/BetaTesterController';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePasskey } from '@/hooks/use-passkey';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import docs from '@/routes/docs';
import { edit } from '@/routes/profile';

export default function Profile({ status }: { status?: string }) {
    const { auth } = usePage().props;
    const { confirmIfNeeded, error: passkeyError } = usePasskey();

    const profileForm = useForm({
        name: auth.user.name,
        email: auth.user.email,
    });

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

    const betaTesterForm = useForm({
        beta_tester: auth.user.roles?.includes('beta_tester') ?? false,
    });

    function submitBetaTester(e: React.FormEvent) {
        e.preventDefault();
        betaTesterForm.patch(BetaTesterController.update.url(), {
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

                <div className="border-t pt-6">
                    <Heading
                        variant="small"
                        title="Beta features"
                        description="Opt in to try experimental features before they're released"
                    />

                    <form onSubmit={submitBetaTester} className="mt-4">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                id="beta_tester"
                                checked={betaTesterForm.data.beta_tester}
                                onCheckedChange={(checked) =>
                                    betaTesterForm.setData(
                                        'beta_tester',
                                        checked === true,
                                    )
                                }
                                data-test="beta-tester-checkbox"
                            />
                            <Label htmlFor="beta_tester">
                                Enable{' '}
                                <Link
                                    href={docs.show('changelog')}
                                    className="underline"
                                >
                                    beta features
                                </Link>
                            </Label>
                            <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                disabled={betaTesterForm.processing}
                                className="ml-auto"
                                data-test="save-beta-tester-button"
                            >
                                Save
                            </Button>
                        </div>
                    </form>
                </div>
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
