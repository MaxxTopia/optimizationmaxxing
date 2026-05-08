import { useEffect, useState } from 'react'
import { CHANGELOG, type ChangelogEntry } from '../lib/changelog'
import { useChangelog } from '../store/useChangelog'

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string) || '0.1.19'

/**
 * Shows the changelog entries the user hasn't seen yet on first launch
 * after an upgrade. Closes via "Got it" → marks current version seen so
 * it won't reappear until the next upgrade.
 */
export function WhatsNewModal() {
  const lastSeen = useChangelog((s) => s.lastSeenVersion)
  const markSeen = useChangelog((s) => s.markSeen)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Show if there is at least one entry newer than what the user last saw.
    if (lastSeen === null) {
      // Brand-new install — don't spam the modal. Mark current as seen silently.
      markSeen(APP_VERSION)
      return
    }
    const newer = entriesNewerThan(lastSeen)
    if (newer.length > 0) setOpen(true)
  }, [lastSeen, markSeen])

  if (!open) return null

  const entries = entriesNewerThan(lastSeen ?? '0.0.0')

  function close() {
    markSeen(APP_VERSION)
    setOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="surface-card w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <header className="p-5 border-b border-border">
          <p className="text-xs uppercase tracking-widest text-text-subtle">what's new</p>
          <h3 className="text-xl font-semibold mt-1">
            Updated to v{APP_VERSION}
          </h3>
          <p className="text-xs text-text-subtle mt-1">
            {entries.length} release{entries.length === 1 ? '' : 's'} since you last opened the app.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {entries.map((e) => (
            <div key={e.version}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-sm font-bold text-accent">v{e.version}</span>
                <span className="text-xs text-text-subtle">{e.date}</span>
              </div>
              <ul className="space-y-1.5 list-disc list-inside text-sm text-text-muted leading-snug">
                {e.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <footer className="p-5 border-t border-border flex justify-end">
          <button
            onClick={close}
            className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold"
          >
            Got it
          </button>
        </footer>
      </div>
    </div>
  )
}

function entriesNewerThan(version: string): ChangelogEntry[] {
  return CHANGELOG.filter((e) => compareVersions(e.version, version) > 0)
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}
