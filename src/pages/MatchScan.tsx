import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsVip } from '../store/useVipStore'
import {
  matchScanPreflight,
  matchScanLive,
  matchScanDeepGpu,
  matchScanDeepCpu,
  matchScanSessionStart,
  matchScanSessionStop,
  matchScanSessionStatus,
  type MatchScanReport,
  type MatchScanFinding,
  type SessionStatus,
} from '../lib/tauri'

/**
 * /match-scan — read-only rig scanner. Surfaces the silent, commonly-missed
 * things hurting competitive-FPS performance, each with a plain-English
 * what's-wrong -> cause -> fix. VIP-only: browsable so non-VIP see the upsell,
 * but running the scan is gated (same convention as /asta). It never writes a
 * tunable — diagnose + recommend only.
 *
 * MVP = the driver-free "preflight" (config landmines, ~1s, before you queue).
 * Live contention + the opt-in Deep scan + PresentMon frametime are next.
 */

const SEV_META: Record<
  MatchScanFinding['severity'],
  { label: string; dot: string; order: number }
> = {
  critical: { label: 'Costing you performance', dot: 'bg-red-500', order: 0 },
  warn: { label: 'Worth tightening', dot: 'bg-amber-400', order: 1 },
  unknown: { label: "Couldn't read", dot: 'bg-slate-400', order: 2 },
  info: { label: 'Minor / FYI', dot: 'bg-sky-400', order: 3 },
  ok: { label: 'Looks good', dot: 'bg-emerald-500', order: 4 },
}

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export function MatchScan() {
  const isVip = useIsVip()
  const [report, setReport] = useState<MatchScanReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [session, setSession] = useState<SessionStatus | null>(null)

  // Poll session status while a recording is running.
  useEffect(() => {
    if (!isVip) return
    let alive = true
    const tick = async () => {
      try {
        const s = await matchScanSessionStatus()
        if (alive) setSession(s)
      } catch {
        /* ignore */
      }
    }
    tick()
    const h = window.setInterval(tick, 2000)
    return () => {
      alive = false
      window.clearInterval(h)
    }
  }, [isVip])

  async function run(kind: 'preflight' | 'live' | 'deep' | 'deepcpu') {
    if (!isVip) return
    setBusy(true)
    setError(null)
    try {
      const fn =
        kind === 'live'
          ? matchScanLive
          : kind === 'deep'
            ? matchScanDeepGpu
            : kind === 'deepcpu'
              ? matchScanDeepCpu
              : matchScanPreflight
      setReport(await fn())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  async function toggleSession() {
    if (!isVip) return
    setError(null)
    try {
      if (session?.running) {
        setBusy(true)
        const verdict = await matchScanSessionStop()
        setReport(verdict)
        setBusy(false)
      } else {
        await matchScanSessionStart()
      }
      setSession(await matchScanSessionStatus())
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }

  const findings = report
    ? [...report.findings].sort(
        (a, b) => SEV_META[a.severity].order - SEV_META[b.severity].order,
      )
    : []

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-text">Match Scan</h1>
        <p className="text-text-muted leading-snug">
          Scans your rig for the silent things quietly hurting your game — the
          stuff most players never check — and tells you in plain English
          what's wrong, what's causing it, and how to fix it. Read-only: it
          never changes a setting on its own.
        </p>
        <p className="text-xs text-text-subtle">
          This is the fast pre-game scan (config landmines). Live in-match
          scanning and the deep hardware scan are coming next.
        </p>
      </header>

      <div className="surface-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-text">Pre-game scan</div>
            <div className="text-sm text-text-muted">
              Config landmines (XMP, refresh rate, VBS, mouse accel…). Run it
              before you queue — about a second.
            </div>
          </div>
          <button
            onClick={() => run('preflight')}
            disabled={busy || !isVip}
            className={`btn-chrome ${isVip ? 'bg-accent' : ''} px-5 py-2 font-semibold whitespace-nowrap ${
              busy || !isVip ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {busy ? 'Scanning…' : isVip ? 'Run pre-game scan' : '👑 VIP only'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap border-t border-border pt-4">
          <div>
            <div className="font-semibold text-text">Live spot-check</div>
            <div className="text-sm text-text-muted">
              Catches what's stealing CPU from your game right now (Defender
              scans, browser / Discord / RGB hogs). Run it while the game's open.
            </div>
          </div>
          <button
            onClick={() => run('live')}
            disabled={busy || !isVip}
            className={`btn-chrome px-5 py-2 font-semibold whitespace-nowrap ${
              busy || !isVip ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {busy ? 'Sampling…' : 'Live spot-check'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap border-t border-border pt-4">
          <div>
            <div className="font-semibold text-text">GPU deep scan</div>
            <div className="text-sm text-text-muted">
              Reads the temps your normal monitor hides — hotspot vs edge (paste
              pump-out) and VRAM-junction throttling. No admin needed.
            </div>
          </div>
          <button
            onClick={() => run('deep')}
            disabled={busy || !isVip}
            className={`btn-chrome px-5 py-2 font-semibold whitespace-nowrap ${
              busy || !isVip ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {busy ? 'Reading…' : 'GPU deep scan'}
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap border-t border-border pt-4">
          <div>
            <div className="font-semibold text-text">CPU deep scan</div>
            <div className="text-sm text-text-muted">
              Real core temperature + voltage (catches thermal throttling and
              over-volting). Asks for admin — needs the hardware-monitor driver.
            </div>
          </div>
          <button
            onClick={() => run('deepcpu')}
            disabled={busy || !isVip}
            className={`btn-chrome px-5 py-2 font-semibold whitespace-nowrap ${
              busy || !isVip ? 'opacity-60 cursor-not-allowed' : ''
            }`}
          >
            {busy ? 'Reading…' : 'CPU deep scan (admin)'}
          </button>
        </div>

        {!isVip && (
          <p className="mt-3 text-sm text-text-muted">
            Match Scan is a VIP feature.{' '}
            <Link to="/pricing" className="text-accent underline">
              See VIP
            </Link>
            .
          </p>
        )}
        {error && (
          <p className="mt-3 text-sm text-red-400">Scan failed: {error}</p>
        )}
      </div>

      <div className="surface-card p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="font-semibold text-text">
              Match recorder
              {session?.running && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-red-400">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  recording
                </span>
              )}
            </div>
            <div className="text-sm text-text-muted">
              {session?.running
                ? `Recording your match — ${fmtElapsed(session.elapsedS)}, ${session.samples} samples. Play, then Stop for the verdict.`
                : 'Start before you queue, play your ranked/scrim, then Stop. Catches thermal throttling, DPC stutter, memory pressure, instability — and real frametimes (1% / 0.1% lows) + whether you were CPU- or GPU-bound. If a supported game is open it captures frametimes via PresentMon (one-time admin prompt).'}
            </div>
          </div>
          <button
            onClick={toggleSession}
            disabled={!isVip || (busy && !session?.running)}
            className={`btn-chrome px-5 py-2 font-semibold whitespace-nowrap ${
              session?.running ? 'bg-accent' : ''
            } ${!isVip ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {!isVip
              ? '👑 VIP only'
              : session?.running
                ? 'Stop & get verdict'
                : 'Start recording'}
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-4">
          <div className="surface-card p-5">
            <div className="text-lg font-semibold text-text">
              {report.headline}
            </div>
            <div className="text-xs text-text-subtle mt-1">
              {report.checked} checks run
            </div>
          </div>

          {findings.map((f) => (
            <FindingCard key={f.id} f={f} />
          ))}

          {report.notes.length > 0 && (
            <div className="surface-card p-4">
              <div className="text-xs uppercase tracking-widest text-text-subtle mb-2">
                Scope & caveats
              </div>
              <ul className="text-sm text-text-muted space-y-1 list-disc pl-4">
                {report.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FindingCard({ f }: { f: MatchScanFinding }) {
  const meta = SEV_META[f.severity]
  const isOk = f.severity === 'ok'
  return (
    <div className="surface-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block w-2 h-2 rounded-full ${meta.dot}`} />
        <span className="text-[10px] uppercase tracking-widest text-text-subtle">
          {meta.label}
        </span>
      </div>
      <div className="font-semibold text-text">{f.title}</div>
      {!isOk && (
        <div className="mt-2 space-y-2 text-sm">
          <p className="text-text-muted">
            <span className="text-text-subtle">Why: </span>
            {f.cause}
          </p>
          <p className="text-text-muted">
            <span className="text-text-subtle">Fix: </span>
            {f.fix}
          </p>
          {f.tweakId && (
            <Link
              to={`/tweaks?focus=${encodeURIComponent(f.tweakId)}`}
              className="text-accent text-sm underline"
            >
              Open the tweak that fixes this →
            </Link>
          )}
        </div>
      )}
      {f.evidence && (
        <div className="mt-2 text-xs text-text-subtle font-mono">
          {f.evidence}
        </div>
      )}
    </div>
  )
}
