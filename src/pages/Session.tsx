import { useEffect, useMemo, useState } from 'react'
import {
  inTauri,
  listSessionCandidates,
  sessionResume,
  sessionSuspend,
  type ProcessEntry,
  type SuspendResult,
} from '../lib/tauri'

/**
 * Game Session mode. "Today I'm focusing on Fortnite" — pick the game, see
 * the list of competing launchers / voice / music / overlays running, hit
 * Start. We Suspend-Process each via PowerShell — they freeze in place
 * (no CPU, no IO, still in RAM, instant resume on End Session).
 *
 * State persists to localStorage so a crash / browser-reload doesn't lose
 * the suspended-PID list. Important: a process whose PID we suspended will
 * stay frozen forever if we lose the PID. The "Force resume by name"
 * fallback button at the bottom rescans + resumes anything matching our
 * curated list.
 */

const SESSION_KEY = 'optmaxxing-active-session'

interface ActiveSession {
  game: string
  startedAt: string
  suspendedPids: number[]
}

interface GameProfile {
  id: string
  label: string
  glyph: string
  /** Process names (lowercase) we DON'T touch when this game is selected
   *  because the game itself depends on them. */
  keepNames: string[]
  /** What to pre-check by category. */
  defaultSuspend: { launcher: boolean; voice: boolean; music: boolean; overlay: boolean }
}

const PROFILES: GameProfile[] = [
  {
    id: 'fortnite',
    label: 'Fortnite',
    glyph: '🎯',
    keepNames: ['epicgameslauncher.exe', 'epicwebhelper.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'valorant',
    label: 'Valorant',
    glyph: '🔫',
    // RiotClient + Vanguard MUST stay alive
    keepNames: ['riotclientservices.exe', 'riotclientux.exe', 'riotclientuxrender.exe', 'valorant.exe', 'vgc.exe', 'vgtray.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'cs2',
    label: 'CS2 / Steam game',
    glyph: '⚡',
    keepNames: ['steam.exe', 'steamwebhelper.exe', 'cs2.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'osu',
    label: 'osu!',
    glyph: '🎵',
    keepNames: ['osu!.exe'],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
  {
    id: 'custom',
    label: 'Custom (suspend everything competing)',
    glyph: '⚙',
    keepNames: [],
    defaultSuspend: { launcher: true, voice: false, music: false, overlay: false },
  },
]

export function Session() {
  const [profileId, setProfileId] = useState<string>('fortnite')
  const [candidates, setCandidates] = useState<ProcessEntry[] | null>(null)
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [active, setActive] = useState<ActiveSession | null>(() => loadActive())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [results, setResults] = useState<SuspendResult[] | null>(null)
  const isNative = inTauri()

  const profile = PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]

  async function refreshCandidates() {
    if (!isNative) {
      setErr('Session mode requires the optimizationmaxxing.exe shell.')
      return
    }
    setErr(null)
    try {
      const list = await listSessionCandidates()
      setCandidates(list)
      // Auto-pre-check rows: match category default + not in this game's keep list.
      const next: Record<number, boolean> = {}
      for (const p of list) {
        const lower = p.name.toLowerCase()
        const keep = profile.keepNames.includes(lower)
        const wantCat = (profile.defaultSuspend as Record<string, boolean>)[p.category] ?? false
        next[p.pid] = !keep && wantCat
      }
      setSelected(next)
    } catch (e) {
      setErr(formatErr(e))
    }
  }

  useEffect(() => {
    if (!active) refreshCandidates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId])

  async function startSession() {
    if (!candidates) return
    const pids = Object.entries(selected)
      .filter(([_, v]) => v)
      .map(([k]) => Number(k))
    if (pids.length === 0) {
      setErr('Nothing checked. Pick at least one process to suspend, or pick a different profile.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await sessionSuspend(pids)
      setResults(res)
      const succeeded = res.filter((r) => r.ok).map((r) => r.pid)
      const session: ActiveSession = {
        game: profile.label,
        startedAt: new Date().toISOString(),
        suspendedPids: succeeded,
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      setActive(session)
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setBusy(false)
    }
  }

  async function endSession() {
    if (!active) return
    setBusy(true)
    setErr(null)
    try {
      const res = await sessionResume(active.suspendedPids)
      setResults(res)
      localStorage.removeItem(SESSION_KEY)
      setActive(null)
      // Re-list candidates so user sees current state.
      refreshCandidates()
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setBusy(false)
    }
  }

  async function forceResumeByName() {
    // Recovery path: re-list known candidates, send Resume-Process on every
    // matching PID. Works even if our session.json got lost.
    if (!isNative) return
    setBusy(true)
    setErr(null)
    try {
      const list = await listSessionCandidates()
      const pids = list.map((p) => p.pid)
      if (pids.length === 0) {
        setErr('Nothing matching our curated list is currently running.')
        return
      }
      const res = await sessionResume(pids)
      setResults(res)
      localStorage.removeItem(SESSION_KEY)
      setActive(null)
      refreshCandidates()
    } catch (e) {
      setErr(formatErr(e))
    } finally {
      setBusy(false)
    }
  }

  const grouped = useMemo(() => {
    if (!candidates) return null
    const out: Record<string, ProcessEntry[]> = {}
    for (const p of candidates) {
      const k = p.category
      if (!out[k]) out[k] = []
      out[k].push(p)
    }
    return out
  }, [candidates])

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">focus</p>
        <h1 className="text-2xl font-bold">Game Session</h1>
        <p className="text-sm text-text-muted max-w-2xl">
          Today I'm playing one game. Suspend the launchers + bloat for the other ones — they
          freeze in place, no CPU, no IO, instant resume on End Session. We use Windows{' '}
          <code className="text-accent">Suspend-Process</code> (PS 5.1+ cmdlet, built-in). Anti-cheat
          processes (vgc.exe etc.) are kept-alive automatically per game profile. The tool does NOT
          launch the game for you — start Fortnite normally after End Session is shown.
        </p>
      </header>

      {err && <div className="surface-card p-3 text-sm text-accent">{err}</div>}

      {active ? (
        <ActiveSessionPanel
          active={active}
          onEnd={endSession}
          busy={busy}
          results={results}
        />
      ) : (
        <>
          <ProfilePicker selectedId={profileId} onChange={setProfileId} />

          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-text-subtle">
              Detected competing apps · pre-checked based on the <strong>{profile.label}</strong>{' '}
              profile (keep-list excluded automatically)
            </p>
            <button
              onClick={refreshCandidates}
              disabled={busy || !isNative}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:border-border-glow"
            >
              Re-scan
            </button>
          </div>

          {grouped && Object.keys(grouped).length === 0 && (
            <div className="surface-card p-6 text-center text-sm text-text-muted italic">
              Nothing in our curated list is currently running. Either you're already lean, or you
              need to add custom processes — that feature isn't built yet.
            </div>
          )}

          {grouped &&
            Object.entries(grouped).map(([cat, rows]) => (
              <CategoryGroup
                key={cat}
                category={cat}
                rows={rows}
                profile={profile}
                selected={selected}
                setSelected={setSelected}
              />
            ))}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={startSession}
              disabled={busy || !candidates || candidates.length === 0 || !isNative}
              className="px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
            >
              {busy ? 'Suspending…' : `Start ${profile.label} session`}
            </button>
            <button
              onClick={forceResumeByName}
              disabled={busy || !isNative}
              className="px-3 py-1.5 rounded-md border border-border text-text-subtle text-xs hover:text-text"
              title="Recovery: scans for any known suspended app and resumes it. Useful if a previous session crashed and processes got stuck."
            >
              Force-resume any known suspended app
            </button>
          </div>

          {results && results.length > 0 && (
            <ResultsList results={results} />
          )}
        </>
      )}
    </div>
  )
}

function ProfilePicker({ selectedId, onChange }: { selectedId: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
      {PROFILES.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`p-3 rounded-md border text-left transition ${
            selectedId === p.id
              ? 'border-accent bg-accent/10 text-text'
              : 'border-border bg-bg-card text-text-muted hover:border-border-glow hover:text-text'
          }`}
        >
          <div className="text-2xl leading-none mb-1" aria-hidden>
            {p.glyph}
          </div>
          <div className="text-sm font-semibold">{p.label}</div>
          {p.keepNames.length > 0 && (
            <div className="text-[10px] text-text-subtle mt-1 truncate">
              keeps: {p.keepNames.slice(0, 2).join(', ')}
              {p.keepNames.length > 2 ? '…' : ''}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

function CategoryGroup({
  category,
  rows,
  profile,
  selected,
  setSelected,
}: {
  category: string
  rows: ProcessEntry[]
  profile: GameProfile
  selected: Record<number, boolean>
  setSelected: (s: Record<number, boolean>) => void
}) {
  const labels: Record<string, string> = {
    launcher: '🎮 Game launchers',
    voice: '🎙 Voice apps',
    music: '🎵 Music apps',
    overlay: '🪟 Overlays / recorders',
    browser: '🌐 Browsers',
    other: 'Other',
  }
  return (
    <div className="surface-card p-4 space-y-2">
      <div className="text-xs uppercase tracking-widest text-text-subtle">
        {labels[category] ?? category}
      </div>
      <div className="space-y-1">
        {rows.map((p) => {
          const lower = p.name.toLowerCase()
          const isKept = profile.keepNames.includes(lower)
          return (
            <label
              key={p.pid}
              className={`flex items-center justify-between gap-3 p-2 rounded border ${
                isKept
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-border hover:border-border-glow'
              } cursor-pointer text-sm`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="checkbox"
                  checked={!!selected[p.pid]}
                  disabled={isKept}
                  onChange={(e) => setSelected({ ...selected, [p.pid]: e.target.checked })}
                  className="shrink-0"
                />
                <span className="font-mono text-text truncate">{p.name}</span>
                <span className="text-[10px] text-text-subtle">PID {p.pid}</span>
                {isKept && (
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">
                    keep
                  </span>
                )}
              </div>
              <span className="text-xs text-text-subtle tabular-nums shrink-0">
                {p.ramMb} MB
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function ActiveSessionPanel({
  active,
  onEnd,
  busy,
  results,
}: {
  active: ActiveSession
  onEnd: () => void
  busy: boolean
  results: SuspendResult[] | null
}) {
  return (
    <div className="surface-card p-6 space-y-4 border-emerald-500/40 bg-emerald-500/5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-emerald-400">● session active</p>
          <h2 className="text-lg font-semibold">Focused on {active.game}</h2>
          <p className="text-xs text-text-muted">
            Started {new Date(active.startedAt).toLocaleTimeString()} ·{' '}
            {active.suspendedPids.length} process{active.suspendedPids.length === 1 ? '' : 'es'} suspended
          </p>
        </div>
        <button
          onClick={onEnd}
          disabled={busy}
          className="px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
        >
          {busy ? 'Resuming…' : 'End session + resume all'}
        </button>
      </div>
      <p className="text-xs text-text-muted">
        Processes are frozen — no CPU, no IO, still in RAM. They resume instantly when you hit End
        Session. If you reboot or the app crashes while a session is active, use the
        force-resume-by-name button on the next launch to recover.
      </p>
      {results && <ResultsList results={results} />}
    </div>
  )
}

function ResultsList({ results }: { results: SuspendResult[] }) {
  const ok = results.filter((r) => r.ok).length
  const fail = results.length - ok
  return (
    <div className="text-xs space-y-1">
      <div className="text-text-muted">
        ✓ {ok} succeeded {fail > 0 ? `· ✗ ${fail} failed` : ''}
      </div>
      {fail > 0 && (
        <details className="text-text-subtle">
          <summary className="cursor-pointer">Show failures</summary>
          <ul className="mt-1 space-y-0.5">
            {results
              .filter((r) => !r.ok)
              .map((r) => (
                <li key={r.pid} className="font-mono">
                  PID {r.pid}: {r.error || '(no message)'}
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function loadActive(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
