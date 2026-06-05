# Bloom

A full-screen, auto-advancing social media reader for Mastodon and Bluesky. Designed to run on a display — posts cycle through one at a time with animated text and a countdown timer, pulling from all your connected accounts into a single merged feed.

![Feed screenshot placeholder](docs/screenshot.png)

## Features

- Connect Mastodon and Bluesky accounts (multiple providers supported simultaneously)
- Posts auto-advance every 8 seconds, after the word animation completes
- Animated text display with randomised GSAP templates (blockTilt, spiral, stackFlip, arc)
- Media backgrounds for image posts
- Reply context shown as a quote above the reply body
- Long URLs truncated to keep the display readable
- Pause/resume with the in-feed button
- Progress bar counts down to the next post

## Stack

| Layer | Technology |
|---|---|
| Backend | PHP 8.3 / Laravel 13 |
| Frontend | React 19 / TypeScript / Vite 8 |
| Routing | Inertia.js v3 |
| Animation | GSAP 3 + SplitText |
| Database | SQLite (default) |

## Requirements

- PHP 8.3+
- Composer
- Node.js 20+
- A Mastodon account and/or a Bluesky account

## Installation

```bash
git clone https://github.com/aquarion/bloom.git
cd bloom

composer install
npm install

cp .env.example .env
php artisan key:generate

php artisan migrate
```

## Running

```bash
# Start the Laravel dev server
php artisan serve

# In a separate terminal, start Vite
npm run dev
```

Then open [http://localhost:8000](http://localhost:8000), register an account, and connect your social accounts via **Settings → Manage Accounts**.

## Connecting accounts

### Mastodon

Enter your instance URL (e.g. `https://fosstodon.org`) on the Manage Accounts page. You'll be redirected through OAuth on your instance and returned automatically.

### Bluesky

Enter your handle and an [app password](https://bsky.app/settings/app-passwords) (not your main password). App passwords can be created in Bluesky's settings.

## Running tests

```bash
# PHP tests
php artisan test

# JavaScript tests
npx vitest run
```

## Contributing

Issues and pull requests are welcome. Please open an issue before starting larger pieces of work.

- [Report a bug or request a feature](https://github.com/aquarion/bloom/issues/new)
- [View open issues](https://github.com/aquarion/bloom/issues)
