<x-mail::message>
# Your account was archived

Hi {{ $tombstone->name }},

Your account was archived due to inactivity. If you'd like it back, click below — you'll be able to choose whether to bring it back as a fresh account or delete it for good.

<x-mail::button :url="$recoveryUrl">
Continue
</x-mail::button>

This link expires in **1 hour** and can only be used once.

If you did not request this, you can safely ignore this email.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
