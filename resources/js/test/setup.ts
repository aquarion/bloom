import '@testing-library/jest-dom';

// Polyfill ResizeObserver for HeadlessUI components in jsdom
if (typeof ResizeObserver === 'undefined') {
    (window as Window & { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}
