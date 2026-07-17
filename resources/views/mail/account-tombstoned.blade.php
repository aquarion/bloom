<x-mail::message>
# Your account has been archived

Hi {{ $name }},

Because your account was inactive for a while, it has now been archived. Your passkeys and connected accounts have been safely stored, and any subscription has been cancelled.

If you'd like your account back, just try signing in again — we'll walk you through recovering or deleting it.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
