import '@testing-library/jest-dom';

// Polyfill ResizeObserver for HeadlessUI components in jsdom
if (typeof ResizeObserver === 'undefined') {
    (window as Window & { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// Newer Node versions define their own global `localStorage`/`sessionStorage`
// (unusable without `--localstorage-file`), which shadows jsdom's working
// window.localStorage instead of leaving the global unset for it to fill.
// Force jsdom's version back onto the global explicitly.
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
