import inertia from "@inertiajs/vite";
import { wayfinder } from "@laravel/vite-plugin-wayfinder";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import laravel from "laravel-vite-plugin";
import { bunny } from "laravel-vite-plugin/fonts";
import { defineConfig } from "vite";
import { iconGenerationPlugin } from "./bin/icons/vite-plugin";

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
	},
	resolve: {
		alias: { "@": "/resources/js" },
	},
});
