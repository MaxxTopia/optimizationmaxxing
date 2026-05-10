import { Component, type ErrorInfo, type ReactNode } from 'react'
import { crashLogFrontend, inTauri } from '../lib/tauri'

/**
 * App-root error boundary. When a render-tree exception escapes (typed wrong
 * prop, undefined access, third-party crash), we:
 *   1. Persist the message + stack to %LOCALAPPDATA%\optmaxxing\crashes\<ts>.log
 *      via the Rust crash_log_frontend command (no-op gracefully in browser
 *      preview).
 *   2. Render a minimal recovery card with: error summary, reload button,
 *      and a Diagnostics deep-link so the user can grab the log + paste it
 *      into Discord support.
 *
 * No network egress. No third-party SDK. Just disk + a copy-paste path.
 */
interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string | null
}

export class CrashBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message ?? String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (inTauri()) {
      // Don't await — best-effort. If the IPC fails, the boundary still
      // renders the recovery card.
      crashLogFrontend(
        `${error.name}: ${error.message}`,
        `${error.stack ?? '(no stack)'}\n\nReact componentStack:\n${info.componentStack ?? '(no componentStack)'}`,
      ).catch(() => {})
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="surface-card p-6 max-w-xl space-y-4">
          <p className="text-xs uppercase tracking-widest text-text-subtle">crash</p>
          <h1 className="text-xl font-bold">Something blew up.</h1>
          <p className="text-sm text-text-muted">
            The app caught an unexpected error and stopped to avoid making it worse. The
            full stack trace was written to your local crash log — Diagnostics → "Last
            crash" has a one-click copy.
          </p>
          {this.state.message && (
            <pre className="text-xs bg-bg-raised border border-border rounded p-3 overflow-x-auto whitespace-pre-wrap text-text-muted">
              {this.state.message}
            </pre>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold"
            >
              Reload app
            </button>
            <a
              href="#/diagnostics"
              className="text-xs underline text-text-muted hover:text-text"
            >
              Open Diagnostics →
            </a>
          </div>
        </div>
      </div>
    )
  }
}
