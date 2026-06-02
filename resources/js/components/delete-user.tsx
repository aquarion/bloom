import { router } from "@inertiajs/react";
import ProfileController from "@/actions/App/Http/Controllers/Settings/ProfileController";
import Heading from "@/components/heading";
import InputError from "@/components/input-error";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { usePasskey } from "@/hooks/use-passkey";

export default function DeleteUser() {
	const { confirmIdentity, loading, error } = usePasskey();

	const handleDelete = async () => {
		const confirmed = await confirmIdentity();

		if (confirmed) {
			router.delete(ProfileController.destroy.url(), { preserveScroll: true });
		}
	};

	return (
		<div className="space-y-6">
			<Heading
				variant="small"
				title="Delete account"
				description="Delete your account and all of its resources"
			/>
			<div className="space-y-4 rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-200/10 dark:bg-red-700/10">
				<div className="relative space-y-0.5 text-red-600 dark:text-red-100">
					<p className="font-medium">Warning</p>
					<p className="text-sm">
						Please proceed with caution, this cannot be undone.
					</p>
				</div>

				<Dialog>
					<DialogTrigger asChild>
						<Button variant="destructive" data-test="delete-user-button">
							Delete account
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogTitle>
							Are you sure you want to delete your account?
						</DialogTitle>
						<DialogDescription>
							Once your account is deleted, all of its resources and data will
							also be permanently deleted. This action cannot be undone.
						</DialogDescription>

						{error && <InputError message={error} />}

						<DialogFooter className="gap-2">
							<DialogClose asChild>
								<Button variant="secondary">Cancel</Button>
							</DialogClose>

							<Button
								variant="destructive"
								disabled={loading}
								onClick={handleDelete}
								data-test="confirm-delete-user-button"
							>
								{loading && <Spinner />}
								Delete account
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
}
