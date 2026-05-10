import { useEffect, useState } from 'react'
import { crashList, crashRead, inTauri, type CrashEntry } from '../lib/tauri'

/**
 * Surfaces the most recent crash logs (Rust panics + frontend exceptions)
 * with one-click copy-to-clipboard so the user can paste into Discord
 * support without hunting through %LOCALAPPDATA%.
 *
 * Renders nothing when the crash dir is empty — no crashes, no card.
 * Hosted on Diagnostics.
 */
export function LastCrashCard() {
  const isNative = inTauri()
  const [entries, setEntries] = useState<CrashEntry[] | null>(null)
  const [openFile, setOpenFile] = useState<string | null>(null)
  const [body, setBody] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isNative) return
    crashList()
      .then((list) => setEntries(list))
      .catch(() => setEntries([]))
  }, [isNative])

  useEffect(() => {
    if (!openFile) {
      setBody(null)
      return
    }
    setBody('Loading…')
    crashRead(openFile)
      .then((b) => setBody(b))
      .catch((e) => setBody(`Failed to read: ${String(e)}`))
  }, [openFile])

  if (!isNative) return null
  if (entries === null) return null
  if (entries.length === 0) return null

  async function copyOpenLog() {
    if (!body) return
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard refused (Tauri dev sometimes does this) — silent fail.
    }
  }

  return (
    <section className="surface-card p-5 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">support</p>
          <h2 className="text-base font-semibold">Last crash</h2>
          <p className="text-xs text-text-muted">
            Recent panic / exception logs from this rig. Copy + paste into Discord support.
            Nothing is sent automatically — local files only.
          </p>
        </div>
      </header>
      <ul className="space-y-1">
        {entries.slice(0, 5).map((e) => {
          const isOpen = openFile === e.filename
          return (
            <li key={e.filename}>
              <button
                onClick={() => setOpenFile(isOpen ? null : e.filename)}
                className="w-full text-left px-3 py-1.5 rounded border border-border hover:border-border-glow text-xs flex items-center justify-between gap-2"
              >
                <span className="font-mono text-text">{e.ts}</span>
                <span className="text-text-subtle uppercase tracking-widest">
                  {e.kind} · {(e.size_bytes / 1024).toFixed(1)} KB
                </span>
              </button>
              {isOpen && (
                <div className="mt-1.5 border border-border rounded p-3 bg-bg-raised space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                      {e.filename}
                    </p>
                    <button
                      onClick={copyOpenLog}
                      disabled={!body || body === 'Loading…'}
                      className="text-[11px] underline hover:text-text text-accent disabled:opacity-40"
                    >
                      {copied ? 'copied ✓' : 'copy'}
                    </button>
                  </div>
                  <pre className="text-[11px] whitespace-pre-wrap text-text-muted overflow-x-auto max-h-64">
                    {body ?? ''}
                  </pre>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
