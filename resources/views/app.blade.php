<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    {{-- Inline script to detect system dark mode preference and apply it immediately --}}
    <script>
        (function() {
            const appearance = '{{ $appearance ?? 'system' }}';

            if (appearance === 'system') {
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                if (prefersDark) {
                    document.documentElement.classList.add('dark');
                }
            }
        })();
    </script>

    {{-- Inline style to set the HTML background color based on our theme in app.css --}}
    <style>
        html {
            background-color: oklch(1 0 0);
        }

        html.dark {
            background-color: oklch(0.145 0 0);
        }
    </style>

    <x-icons />

    @fonts

    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
    <x-inertia::head>
        <title>{{ config('app.name', 'Laravel') }}</title>
    </x-inertia::head>
</head>

<body class="font-sans antialiased">
    <x-inertia::app />

    {{--
        Plain-DOM fallback for errors ErrorBoundary can't catch — a throw during
        React root creation or the initial render itself, before ErrorBoundary has
        mounted (e.g. the react/react-dom mismatch behind #271). Present in the
        initial HTML response, hidden by default, and revealed by the inline
        script below without depending on the app bundle having loaded at all.
    --}}
    <div
        id="app-fallback"
        role="alert"
        class="fixed inset-0 z-[9999] hidden min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground"
    >
        <p class="font-semibold text-lg">Something went wrong.</p>
        <p class="text-muted-foreground text-sm">
            Bloom couldn't start. Reloading usually fixes this.
        </p>
        <a
            href="{{ url()->full() }}"
            class="rounded-md border px-4 py-2 text-sm hover:bg-muted"
        >
            Reload page
        </a>
    </div>

    <script>
        (function () {
            var root = document.getElementById('app');
            var fallback = document.getElementById('app-fallback');

            if (!root || !fallback) {
                return;
            }

            // SSR (when enabled) already rendered real content into #app before
            // this script ran — the blank-screen failure mode below can't happen.
            if (root.children.length > 0) {
                return;
            }

            var revealed = false;
            var timer;

            function reveal(reason) {
                // #app may have painted since the triggering event fired (or
                // this is a stray error unrelated to app boot) — never show
                // a failure screen over an app that's actually up.
                if (root.children.length > 0) {
                    return;
                }

                if (revealed) {
                    return;
                }

                revealed = true;
                console.error('[app-fallback] revealing fallback UI:', reason);
                fallback.classList.remove('hidden');
                fallback.classList.add('flex');
            }

            // Authoritative regardless of whether the fallback was ever
            // revealed — a stray pre-mount error must not leave a working
            // app stuck behind a permanent "reload" screen once it does mount.
            function hideAndTeardown() {
                if (revealed) {
                    revealed = false;
                    fallback.classList.add('hidden');
                    fallback.classList.remove('flex');
                }

                window.removeEventListener('error', onError);
                window.removeEventListener('unhandledrejection', onError);
                observer.disconnect();
                clearTimeout(timer);
            }

            function onError(event) {
                reveal(event);
            }

            var observer = new MutationObserver(function () {
                if (root.children.length > 0) {
                    hideAndTeardown();
                }
            });
            observer.observe(root, { childList: true });

            window.addEventListener('error', onError);
            window.addEventListener('unhandledrejection', onError);

            // Grace period: if nothing has painted into #app within 8s, assume
            // the failure happened silently (no error event at all) and show
            // the fallback anyway rather than leaving a blank screen forever.
            timer = setTimeout(function () {
                reveal('timeout: #app had not painted within 8s');
            }, 8000);
        })();
    </script>
</body>

</html>
