import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function fireKeyOnWindow(key: string) {
    act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
}

it('calls the handler for a matching key', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    fireKeyOnWindow('j');
    expect(handler).toHaveBeenCalledOnce();
});

it('does not call handler for unregistered keys', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    fireKeyOnWindow('x');
    expect(handler).not.toHaveBeenCalled();
});

it('suppresses the handler when focus is inside an input', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
        input.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
        );
    });
    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(input);
});

it('suppresses the handler when focus is inside a textarea', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ j: handler }));
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    act(() => {
        textarea.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
        );
    });
    expect(handler).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
});

it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ j: handler }));
    unmount();
    fireKeyOnWindow('j');
    expect(handler).not.toHaveBeenCalled();
});
