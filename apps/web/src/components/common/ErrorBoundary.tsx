import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[FairShare ErrorBoundary caught]:", error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6 font-sans">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-xl max-w-md w-full p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900">Session Initialization Recovered</h2>
            <p className="text-xs text-zinc-600 leading-relaxed">
              FairShare encountered a stale state or browser session conflict:
            </p>
            <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-left font-mono text-[11px] text-zinc-700 overflow-x-auto max-h-24">
              {this.state.error?.message || "Unknown runtime exception"}
            </div>
            <button
              onClick={this.handleReset}
              className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-2" />
              Reset Session & Load Clean Terminal
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
