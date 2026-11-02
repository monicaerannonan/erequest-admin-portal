import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Uncaught application error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = "#/dashboard";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f4f7fb",
            padding: "24px",
            fontFamily: "system-ui, -apple-system, sans-serif"
          }}
        >
          <div
            style={{
              maxWidth: "520px",
              width: "100%",
              background: "#ffffff",
              borderRadius: "16px",
              padding: "36px 32px",
              boxShadow: "0 10px 30px rgba(16, 37, 68, 0.08)",
              textAlign: "center",
              border: "1px solid #e2e8f0"
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#fee2e2",
                color: "#dc2626",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px"
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h2
              style={{
                fontSize: "20px",
                fontWeight: "700",
                color: "#0f172a",
                margin: "0 0 10px"
              }}
            >
              Something went wrong
            </h2>

            <p
              style={{
                fontSize: "14px",
                color: "#64748b",
                lineHeight: "1.5",
                margin: "0 0 24px"
              }}
            >
              An unexpected display error occurred. You can reload the page or return to the dashboard.
            </p>

            {this.state.error?.message && (
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "12px",
                  color: "#e11d48",
                  textAlign: "left",
                  marginBottom: "24px",
                  wordBreak: "break-word",
                  fontFamily: "monospace"
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "background 0.15s"
                }}
              >
                Reload Page
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: "10px 20px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
