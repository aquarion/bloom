import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) {
        throw new Error('test render error');
    }

    return <p>All good</p>;
}

beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    vi.mocked(console.error).mockRestore();
});

describe('ErrorBoundary', () => {
    it('renders children normally when no error occurs', () => {
        render(
            <ErrorBoundary>
                <Bomb shouldThrow={false} />
            </ErrorBoundary>,
        );

        expect(screen.getByText('All good')).toBeInTheDocument();
    });

    it('renders the fallback UI when a child throws', () => {
        render(
            <ErrorBoundary>
                <Bomb shouldThrow />
            </ErrorBoundary>,
        );

        expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /reload page/i }),
        ).toBeInTheDocument();
        expect(screen.queryByText('All good')).not.toBeInTheDocument();
    });

    it('logs the error and component stack to console.error', () => {
        render(
            <ErrorBoundary>
                <Bomb shouldThrow />
            </ErrorBoundary>,
        );

        expect(console.error).toHaveBeenCalledWith(
            '[Bloom] Unhandled render error:',
            expect.any(Error),
            expect.any(String),
        );
    });

    it('reloads the page when the reload button is clicked', () => {
        const reload = vi.fn();
        Object.defineProperty(window, 'location', {
            value: { reload },
            writable: true,
        });

        render(
            <ErrorBoundary>
                <Bomb shouldThrow />
            </ErrorBoundary>,
        );

        fireEvent.click(screen.getByRole('button', { name: /reload page/i }));

        expect(reload).toHaveBeenCalledTimes(1);
    });
});
