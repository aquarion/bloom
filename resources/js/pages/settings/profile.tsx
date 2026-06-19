import { Form, Head, useForm, usePage } from '@inertiajs/react';
import BetaTesterController from '@/actions/App/Http/Controllers/Settings/BetaTesterController';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SettingsPageLayout from '@/layouts/settings-page-layout';
import { edit } from '@/routes/profile';

export default function Profile({ status }: { status?: string }) {
    const { auth } = usePage().props;

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

                <Form
                    {...ProfileController.update.form()}
                    options={{
                        preserveScroll: true,
                    }}
                    className="space-y-6"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>

                                <Input
                                    id="name"
                                    className="mt-1 block w-full"
                                    defaultValue={auth.user.name}
                                    name="name"
                                    required
                                    autoComplete="name"
                                    placeholder="Full name"
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.name}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="email">Email address</Label>

                                <Input
                                    id="email"
                                    type="email"
                                    className="mt-1 block w-full"
                                    defaultValue={auth.user.email}
                                    name="email"
                                    required
                                    autoComplete="username"
                                    placeholder="Email address"
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.email}
                                />
                            </div>

                            {status && (
                                <p className="font-medium text-green-600 text-sm">
                                    {status}
                                </p>
                            )}

                            <div className="flex items-center gap-4">
                                <Button
                                    disabled={processing}
                                    data-test="update-profile-button"
                                >
                                    Save
                                </Button>
                            </div>
                        </>
                    )}
                </Form>

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
                                Enable beta features
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
