import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** A node, or a render function that receives `reset` to clear the error and render children again. */
  fallback?: ReactNode | ((reset: () => void) => ReactNode);
  /** Clears the error when any key changes, for example after Undo replaces the document. */
  resetKeys?: readonly unknown[];
}

function resetKeysChanged(previous: readonly unknown[] = [], next: readonly unknown[] = []) {
  return previous.length !== next.length || previous.some((key, index) => !Object.is(key, next[index]));
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(previousProps: Props) {
    if (this.state.hasError && resetKeysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      if (typeof fallback === 'function') {
        return fallback(this.reset);
      }
      if (fallback != null) {
        return fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '1.5rem',
            background: 'var(--surface-app)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
          }}
        >
          <span>Something went wrong.</span>
          <button
            type="button"
            onClick={this.reset}
            style={{
              padding: '0.4rem 1rem',
              background: 'transparent',
              border: '1px solid var(--line-default)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              cursor: 'pointer',
              borderRadius: '3px',
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
