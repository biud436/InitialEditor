/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';

interface ErrorBoundaryStates {
    hasError: boolean;
}

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

export default class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryStates
> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(_error: any): ErrorBoundaryStates {
        return { hasError: true };
    }

    componentDidCatch(error: any, errorInfo: any) {
        console.error({ error, errorInfo });
    }

    render() {
        // Check if the error is thrown
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div>
                    <h2>Oops, there is an error!</h2>
                    <button
                        type="button"
                        onClick={() => this.setState({ hasError: false })}
                    >
                        Try again?
                    </button>
                </div>
            );
        }

        // Return children components in case of no error
        return this.props.children;
    }
}
