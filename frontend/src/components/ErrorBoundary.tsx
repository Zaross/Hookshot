import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] p-8 text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-accent-red/10 border border-accent-red/20 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-accent-red" />
          </div>
          <div>
            <p className="font-semibold text-text-primary mb-1">Seite konnte nicht geladen werden</p>
            <p className="text-sm text-text-muted font-mono">{this.state.error.message}</p>
          </div>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
            className="btn-secondary"
          >
            <RefreshCw className="w-4 h-4" />
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
