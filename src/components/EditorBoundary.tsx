import { Component, type ReactNode } from "react";

export class EditorBoundary extends Component<
  { children: ReactNode; close: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="loading">
        <h1>Could not open this canvas</h1>
        <p role="alert">
          Return to your workspaces and reopen the saved board.
        </p>
        <button className="button" onClick={this.props.close}>
          Return to workspaces
        </button>
      </div>
    );
  }
}
