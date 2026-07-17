<x-mail::message>
# Your account is going quiet

Hi {{ $user->name }},

We haven't seen you sign in for a while. If you don't sign in again soon, your account will be archived and your connected feeds disconnected.

Just sign in with your passkey any time to keep your account active — no other action is needed.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
