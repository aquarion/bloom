import inertia from "@inertiajs/vite";
import { wayfinder } from "@laravel/vite-plugin-wayfinder";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import laravel from "laravel-vite-plugin";
import { bunny } from "laravel-vite-plugin/fonts";
import { defineConfig } from "vite";
import { defaultExclude } from "vitest/config";
import { iconGenerationPlugin } from "./bin/icons/vite-plugin.js";

export default defineConfig({
	plugins: [
		iconGenerationPlugin(),
		laravel({
			input: [
				"resources/css/app.css",
				"resources/js/app.tsx",
				"resources/icons/apple-touch-icon.png",
				"resources/icons/favicon-96x96.png",
				"resources/icons/favicon.ico",
				"resources/icons/favicon.svg",
				"resources/icons/web-app-manifest-192x192.png",
				"resources/icons/web-app-manifest-512x512.png",
				"resources/icons/bloom-standard.png",
				"resources/icons/bloom-on-white.png",
			],
			refresh: true,
			fonts: [
				bunny("Instrument Sans", {
					weights: [400, 500, 600],
				}),
			],
		}),
		inertia(),
		react({
			babel: {
				plugins: ["babel-plugin-react-compiler"],
			},
		}),
		tailwindcss(),
		wayfinder({
			formVariants: true,
		}),
	],
	test: {
		environment: "jsdom",
		setupFiles: ["resources/js/test/setup.ts"],
		globals: true,
		passWithNoTests: true,
		// vitest's default excludes don't cover PHP's vendor/ dir, so without
		// this it also picks up (and fails to run) Laravel Wayfinder's own
		// bundled test suite under vendor/laravel/wayfinder/tests.
		exclude: [...defaultExclude, "**/vendor/**"],
	},
	resolve: {
		alias: { "@": "/resources/js" },
	},
	server: ((tunnelViteHost) => ({
		// Scoped to the origins that actually embed these assets (the app
		// page, not this dev server's own origin), rather than a wildcard:
		// this dev server is reachable through the public Cloudflare tunnel
		// (see docker/cloudflared/config.yml), so an open CORS policy would
		// let any site read its responses.
		cors: {
			origin: [
				`http://localhost:${process.env.OCTANE_PORT ?? 8000}`,
				// The app's tunnel hostname is "vite-" stripped off this one
				// (bloom.istic.dev / vite-bloom.istic.dev - see config.yml).
				tunnelViteHost ? `https://${tunnelViteHost.replace(/^vite-/, "")}` : null,
			].filter(Boolean),
		},
		// laravel-vite-plugin writes this origin into public/hot ONCE, at
		// server start - it can't vary per-request. Left unset, it defaults
		// to http://localhost:5173 (via LARAVEL_SAIL auto-detection), which
		// a page served over the HTTPS tunnel can't load as mixed content.
		// Set CLOUDFLARE_VITE_HOSTNAME=vite-bloom.istic.dev in .env when you
		// need the tunnel to actually render (pattern from istic/alchemistic,
		// the app this tunnel setup was ported from).
		origin: tunnelViteHost ? `https://${tunnelViteHost}` : undefined,
		// The HMR websocket doesn't go through laravel-vite-plugin at all, so
		// it needs its own override: the tunnel only exposes 443 (wss), not
		// container port 5173 directly.
		hmr: tunnelViteHost ? { host: tunnelViteHost, protocol: "wss", clientPort: 443 } : { host: "localhost" },
		// Vite rejects requests whose Host header isn't localhost/the dev
		// server's own address; the tunnel fronts the dev server under this
		// hostname instead (see docker/cloudflared/config.yml).
		allowedHosts: tunnelViteHost ? [tunnelViteHost] : [],
	}))(process.env.CLOUDFLARE_VITE_HOSTNAME),
});
