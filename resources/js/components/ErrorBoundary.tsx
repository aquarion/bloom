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
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
                    <p className="font-semibold text-lg">
                        Something went wrong.
                    </p>
                    <button
                        type="button"
                        className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
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
