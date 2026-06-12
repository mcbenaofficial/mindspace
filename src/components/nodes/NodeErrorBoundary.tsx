import React from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { MindNode } from "../../types";

interface BoundaryState {
  error: Error | null;
}

class NodeErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Node component crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            width: "100%", height: "100%", minWidth: 180, minHeight: 90,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 8, padding: 14, borderRadius: 12,
            background: "var(--ms-surface)", border: "1px solid rgba(248,113,113,0.4)",
          }}
        >
          <AlertTriangle size={16} color="#f87171" />
          <span style={{ fontSize: 11, color: "var(--ms-text-muted)", textAlign: "center", lineHeight: 1.5 }}>
            This node hit an error.
            <br />
            Its data is safe in the database.
          </span>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              background: "var(--ms-border)", border: "none", borderRadius: 6,
              color: "var(--ms-text)", fontSize: 11, padding: "4px 12px", cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LockBadge() {
  return (
    <span
      style={{
        position: "absolute", top: -8, left: -8,
        width: 20, height: 20, borderRadius: "50%",
        background: "var(--ms-surface)", border: "1px solid var(--ms-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10, pointerEvents: "none", color: "var(--ms-text-muted)",
      }}
    >
      <Lock size={9} />
    </span>
  );
}

// Wraps a canvas node component in an error boundary (one crashing node must
// not take down the whole canvas), React.memo, and the lock badge overlay.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withNodeBoundary<P extends object>(Component: React.ComponentType<P>): any {
  const Wrapped: React.FC<P> = (props) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mindNode = (props as any)?.data?.mindNode as MindNode | undefined;
    return (
      <NodeErrorBoundary>
        <Component {...props} />
        {mindNode?.locked && <LockBadge />}
      </NodeErrorBoundary>
    );
  };
  Wrapped.displayName = `withNodeBoundary(${Component.displayName || Component.name || "Node"})`;
  return React.memo(Wrapped);
}
