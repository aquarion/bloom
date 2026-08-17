/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extracts the literal source of the error-fallback inline <script> from
 * app.blade.php (the last of its two <script> blocks — the first is the
 * dark-mode detector) so these tests exercise the exact script that ships,
 * not a separately-maintained reimplementation that could drift from it.
 */
function extractFallbackScript(): string {
    const bladePath = path.resolve(
        dirname,
        '../../../resources/views/app.blade.php',
    );
    const source = fs.readFileSync(bladePath, 'utf-8');
    const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (m) => m[1],
    );

    if (scripts.length < 2) {
        throw new Error(
            'Expected two <script> blocks in app.blade.php (dark-mode detector + app-fallback) — did the template change?',
        );
    }

    return scripts[scripts.length - 1];
}

function runFallbackScript() {
    // Indirect eval (forces global scope) of the literal shipped script —
    // not a duplicate reimplementation, so these tests can't drift from
    // what actually ships in the Blade template.
    // biome-ignore lint/security/noGlobalEval: exercising the literal inline script from app.blade.php
    (0, eval)(extractFallbackScript());
}

describe('app.blade.php error-fallback inline script', () => {
    let root: HTMLDivElement;
    let fallback: HTMLDivElement;
    let consoleError: ReturnType<typeof vi.spyOn>;
    let addedListeners: Array<[string, EventListener]>;
    let realAddEventListener: typeof window.addEventListener;

    beforeEach(() => {
        document.body.innerHTML = '';
        root = document.createElement('div');
        root.id = 'app';
        fallback = document.createElement('div');
        fallback.id = 'app-fallback';
        fallback.className = 'hidden';
        document.body.append(root, fallback);
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

        // The script under test attaches listeners to `window`, which persists
        // across tests in this file — track and remove them in afterEach so a
        // stale listener from one test can't fire during a later one.
        addedListeners = [];
        realAddEventListener = window.addEventListener.bind(window);
        window.addEventListener = ((
            type: string,
            listener: EventListener,
            options?: boolean | AddEventListenerOptions,
        ) => {
            addedListeners.push([type, listener]);
            realAddEventListener(type, listener, options);
        }) as typeof window.addEventListener;
    });

    afterEach(() => {
        window.addEventListener = realAddEventListener;

        for (const [type, listener] of addedListeners) {
            window.removeEventListener(type, listener);
        }

        consoleError.mockRestore();
        vi.useRealTimers();
    });

    it('registers both an error and an unhandledrejection listener', () => {
        runFallbackScript();

        expect(addedListeners.some(([type]) => type === 'error')).toBe(true);
        expect(
            addedListeners.some(([type]) => type === 'unhandledrejection'),
        ).toBe(true);
    });

    it('stays hidden on load', () => {
        runFallbackScript();

        expect(fallback.classList.contains('hidden')).toBe(true);
    });

    it('reveals the fallback and logs the trigger when a window error fires before #app has mounted', () => {
        runFallbackScript();

        window.dispatchEvent(new ErrorEvent('error'));

        expect(fallback.classList.contains('hidden')).toBe(false);
        expect(fallback.classList.contains('flex')).toBe(true);
        expect(consoleError).toHaveBeenCalledWith(
            '[app-fallback] revealing fallback UI:',
            expect.anything(),
        );
    });

    it('hides the fallback again once #app mounts, even after it was revealed', async () => {
        runFallbackScript();

        window.dispatchEvent(new ErrorEvent('error'));
        expect(fallback.classList.contains('hidden')).toBe(false);

        root.appendChild(document.createElement('div'));
        // MutationObserver callbacks fire as a microtask.
        await Promise.resolve();
        await Promise.resolve();

        expect(fallback.classList.contains('hidden')).toBe(true);
        expect(fallback.classList.contains('flex')).toBe(false);
    });

    it('does not reveal the fallback for an error that fires after #app has already mounted', () => {
        runFallbackScript();

        root.appendChild(document.createElement('div'));

        window.dispatchEvent(new ErrorEvent('error'));

        expect(fallback.classList.contains('hidden')).toBe(true);
    });

    it('reveals the fallback after the grace period if nothing has painted', () => {
        vi.useFakeTimers();
        runFallbackScript();

        vi.advanceTimersByTime(8000);

        expect(fallback.classList.contains('hidden')).toBe(false);
    });

    it('does not arm any listeners when #app already has content at script-eval time (SSR)', () => {
        root.appendChild(document.createElement('div'));

        runFallbackScript();
        window.dispatchEvent(new ErrorEvent('error'));

        expect(addedListeners).toHaveLength(0);
        expect(fallback.classList.contains('hidden')).toBe(true);
    });
});
