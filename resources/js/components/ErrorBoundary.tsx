import { reportError } from '@istic-co/otel-browser-errors';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

type Props = {
    children: ReactNode;
};

type State = {
    error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error(
            '[Bloom] Unhandled render error:',
            error,
            info.componentStack,
        );
        reportError(error, { componentStack: info.componentStack ?? '' });
    }

    render() {
        if (this.state.error) {
            return (
                <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
                    <p className="text-lg font-semibold">
                        Something went wrong.
                    </p>
                    <button
                        type="button"
                        className="hover:bg-muted rounded-md border px-4 py-2 text-sm"
                        onClick={() => window.location.reload()}
                    >
                        Reload page
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
