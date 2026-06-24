import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function fireKeyOnWindow(key: string) {
    act(() => {
        window.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true }),
        );
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
    const input = document.createElement('input');
    document.body.appendChild(input);

    try {
        renderHook(() => useKeyboardShortcuts({ j: handler }));
        act(() => {
            input.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
            );
        });
        expect(handler).not.toHaveBeenCalled();
    } finally {
        document.body.removeChild(input);
    }
});

it('suppresses the handler when focus is inside a textarea', () => {
    const handler = vi.fn();
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    try {
        renderHook(() => useKeyboardShortcuts({ j: handler }));
        act(() => {
            textarea.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
            );
        });
        expect(handler).not.toHaveBeenCalled();
    } finally {
        document.body.removeChild(textarea);
    }
});

it('suppresses the handler when focus is inside a select', () => {
    const handler = vi.fn();
    const select = document.createElement('select');
    document.body.appendChild(select);

    try {
        renderHook(() => useKeyboardShortcuts({ j: handler }));
        act(() => {
            select.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
            );
        });
        expect(handler).not.toHaveBeenCalled();
    } finally {
        document.body.removeChild(select);
    }
});

it('removes the listener on unmount', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ j: handler }));
    unmount();
    fireKeyOnWindow('j');
    expect(handler).not.toHaveBeenCalled();
});
