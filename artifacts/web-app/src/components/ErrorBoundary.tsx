import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary] Uncaught render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white rounded-xl border border-red-200 shadow-sm p-8 max-w-lg w-full">
          <h1 className="text-lg font-semibold text-red-700 mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-600 mb-4">
            The page couldn't load. Please try refreshing — if the problem keeps happening,
            contact your administrator.
          </p>
          <details className="text-xs text-gray-400 font-mono whitespace-pre-wrap break-all">
            <summary className="cursor-pointer text-gray-500 font-sans font-medium mb-1">
              Technical detail
            </summary>
            {error.message}
            {error.stack ? "\n\n" + error.stack : ""}
          </details>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 px-4 py-2 rounded-lg bg-[#00AECD] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Refresh page
          </button>
        </div>
      </div>
    );
  }
}
