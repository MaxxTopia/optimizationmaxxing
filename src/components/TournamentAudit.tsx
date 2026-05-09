import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  auditState,
  benchPing,
  inTauri,
  type AuditState,
} from '../lib/tauri'
import { runBench, score, type BenchScored } from '../lib/astaBench'

/**
 * Pre-tournament audit. Composes:
 *
 *   - Asta Bench composite ≥ 75 (the "tuned enough" gate)
 *   - Ping to Cloudflare 1.1.1.1 — p50 < 30 ms, stddev < 8 ms
 *   - Game DVR registry off
 *   - Recording apps NOT running (OBS / Streamlabs / GeForce / etc.)
 *   - Windows Update service NOT running
 *   - Search Indexer NOT running
 *
 * Per-check pass/fail card + an overall verdict ribbon. Designed for the
 * 60 seconds before someone enters an FNCS scrim.
 */

type Verdict = 'pass' | 'warn' | 'fail'

interface CheckRow {
  label: string
  detail: string
  verdict: Verdict
}

export function TournamentAudit() {
  const isNative = inTauri()
  const [running, setRunning] = useState(false)
  const [stage, setStage] = useState<string>('idle')
  const [bench, setBench] = useState<BenchScored | null>(null)
  const [pingP50, setPingP50] = useState<number | null>(null)
  const [pingStddev, setPingStddev] = useState<number | null>(null)
  const [audit, setAudit] = useState<AuditState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run() {
    if (!isNative) {
      setErr('Audit requires the optimizationmaxxing.exe shell.')
      return
    }
    setRunning(true)
    setErr(null)
    setBench(null)
    setPingP50(null)
    setPingStddev(null)
    setAudit(null)
    try {
      setStage('bench')
      const b = score(await runBench())
      setBench(b)
      // Bench already captured 30 pings via existing benchPing inside; capture
      // separately here for the pre-tournament check (same target, fewer
      // samples, faster).
      setStage('ping')
      const p = await benchPing('1.1.1.1', 20)
      setPingP50(p.p50Ms)
      setPingStddev(p.stddevMs)
      setStage('audit')
      const a = await auditState()
      setAudit(a)
      setStage('done')
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error).message ?? String(e))
    } finally {
      setRunning(false)
    }
  }

  const checks: CheckRow[] = []
  if (bench) {
    const composite = bench.composite
    checks.push({
      label: 'Latency Health Score',
      detail: `${composite.toFixed(0)} / 100  ·  target ≥ 75`,
      verdict: composite >= 75 ? 'pass' : composite >= 60 ? 'warn' : 'fail',
    })
  }
  if (pingP50 != null && pingStddev != null) {
    const pingOk = pingP50 < 30 && pingStddev < 8
    const pingClose = pingP50 < 50 && pingStddev < 15
    checks.push({
      label: 'Network ping (1.1.1.1)',
      detail: `p50 ${pingP50} ms, jitter ±${pingStddev.toFixed(1)} ms  ·  target < 30 ms / < 8 ms`,
      verdict: pingOk ? 'pass' : pingClose ? 'warn' : 'fail',
    })
  }
  if (bench) {
    const dpc = bench.dpc.totalDpcPercent
    checks.push({
      label: 'DPC %',
      detail: `${dpc.toFixed(2)}%  ·  target < 2%`,
      verdict: dpc < 2 ? 'pass' : dpc < 5 ? 'warn' : 'fail',
    })
  }
  if (audit) {
    checks.push({
      label: 'Game DVR',
      detail: `state: ${audit.gameDvrState}  ·  target: off`,
      verdict: audit.gameDvrState === 'off' ? 'pass' : audit.gameDvrState === 'unknown' ? 'warn' : 'fail',
    })
    if (audit.recordingApps.length === 0) {
      checks.push({
        label: 'Recording / overlay apps',
        detail: 'none detected — clean',
        verdict: 'pass',
      })
    } else {
      const list = audit.recordingApps.map((p) => `${p.name} (${p.ramMb} MB)`).join(', ')
      checks.push({
        label: 'Recording / overlay apps',
        detail: `${audit.recordingApps.length} running: ${list}`,
        verdict: 'warn',
      })
    }
    checks.push({
      label: 'Windows Update service',
      detail: `state: ${audit.windowsUpdateState}  ·  target: stopped`,
      verdict: /stopped|disabled/i.test(audit.windowsUpdateState)
        ? 'pass'
        : /running|started/i.test(audit.windowsUpdateState)
        ? 'fail'
        : 'warn',
    })
    checks.push({
      label: 'Search Indexer',
      detail: `state: ${audit.searchIndexerState}  ·  target: stopped`,
      verdict: /stopped|disabled/i.test(audit.searchIndexerState)
        ? 'pass'
        : /running|started/i.test(audit.searchIndexerState)
        ? 'warn'
        : 'warn',
    })
  }

  const overall: Verdict | null = (() => {
    if (checks.length === 0) return null
    if (checks.some((c) => c.verdict === 'fail')) return 'fail'
    if (checks.some((c) => c.verdict === 'warn')) return 'warn'
    return 'pass'
  })()

  return (
    <section className="surface-card p-6 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">tournament check</p>
          <h3 className="text-xl font-bold">Pre-Tournament Audit</h3>
          <p className="text-xs text-text-muted leading-snug max-w-2xl mt-1">
            One button, ~40 seconds, six checks. Run before you queue an FNCS / VCT scrim — catches
            a corrupted setup before it costs you a tournament slot.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-40"
        >
          {running ? `Running… (${stage})` : checks.length > 0 ? 'Re-audit' : 'Run audit'}
        </button>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </div>
      )}

      {overall && (
        <div
          className={`rounded-md px-4 py-3 text-sm font-semibold flex items-center gap-3 ${
            overall === 'pass'
              ? 'border border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
              : overall === 'warn'
              ? 'border border-amber-500/50 bg-amber-500/10 text-amber-300'
              : 'border border-red-500/60 bg-red-500/10 text-red-300'
          }`}
        >
          <span className="text-lg">
            {overall === 'pass' ? '✓' : overall === 'warn' ? '⚠' : '✗'}
          </span>
          <span>
            {overall === 'pass' && 'You\'re ready. Queue up.'}
            {overall === 'warn' && 'Mostly fine — fix the items below first.'}
            {overall === 'fail' && 'You\'ll regret entering. Fix the red rows.'}
          </span>
        </div>
      )}

      {checks.length > 0 && (
        <ul className="divide-y divide-border">
          {checks.map((c) => (
            <li key={c.label} className="py-2 flex items-start gap-3">
              <span
                className={`text-base shrink-0 leading-snug ${
                  c.verdict === 'pass'
                    ? 'text-emerald-300'
                    : c.verdict === 'warn'
                    ? 'text-amber-300'
                    : 'text-red-400'
                }`}
              >
                {c.verdict === 'pass' ? '✓' : c.verdict === 'warn' ? '⚠' : '✗'}
              </span>
              <div className="min-w-0">
                <p className="text-sm text-text font-semibold">{c.label}</p>
                <p className="text-xs text-text-muted">{c.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {checks.length === 0 && !running && (
        <p className="text-xs text-text-subtle italic">
          Run the audit to see your readiness card.{' '}
          <Link to="/benchmark" className="underline hover:text-text text-accent">
            Or open Asta Bench directly
          </Link>{' '}
          to save snapshots.
        </p>
      )}
    </section>
  )
}
