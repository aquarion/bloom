import '@testing-library/jest-dom';

// Polyfill ResizeObserver for HeadlessUI components in jsdom
if (typeof ResizeObserver === 'undefined') {
    (window as Window & { ResizeObserver: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// Polyfill matchMedia for the useIsMobile hook (sidebar components), which
// reads it at module-load time rather than inside the hook.
if (typeof window.matchMedia === 'undefined') {
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
