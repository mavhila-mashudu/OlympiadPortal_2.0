import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorAlert } from "./Feedback";

export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Rendering errors are intentionally contained so users can recover without a full blank page.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ margin: "2rem auto", maxWidth: "76rem", padding: "0 1rem" }}>
          <ErrorAlert
            message="Something unexpected interrupted this page. Your information has not been changed."
            onRetry={() => this.setState({ hasError: false })}
            title="This page needs to be reloaded"
          />
        </main>
      );
    }
    return this.props.children;
  }
}
