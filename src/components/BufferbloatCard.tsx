import { useState } from 'react'
import { bufferbloatProbe, inTauri, type BufferbloatReport } from '../lib/tauri'

/**
 * In-app bufferbloat probe — runs a ~14 s test that measures idle ping p50,
 * fires a 30 MB Cloudflare /__down stream, and re-measures ping under load.
 * The delta is the bufferbloat indicator. Replaces the old "click out to
 * Waveform" UX with results that stay inside the app. External links remain
 * as a "deeper test" footer for users who want Waveform's full grade.
 */

const GRADE_BLURBS: Record<string, string> = {
  A: 'Excellent. Calls + ranked games stay smooth even when downloads run.',
  B: 'Good. Most games will not feel under-buffered traffic.',
  C: 'Noticeable. Voice + competitive games may hitch when something downloads.',
  D: 'Severe. Router QoS or cake/fq_codel is strongly recommended.',
  F: 'Broken. Anything else on the link will dominate your latency. Fix this first.',
  '—': 'Probe did not return readable data — try once more, then check the deeper-test links.',
}

export function BufferbloatCard() {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<BufferbloatReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const isNative = inTauri()

  async function runProbe() {
    if (!isNative) {
      setErr('Probe requires the optimizationmaxxing.exe shell — open the desktop app.')
      return
    }
    setRunning(true)
    setErr(null)
    setReport(null)
    try {
      const r = await bufferbloatProbe()
      setReport(r)
      if (r.error) setErr(r.error)
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error).message ?? String(e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="surface-card p-5 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-widest text-text-subtle">network</p>
        <h3 className="text-lg font-semibold">Bufferbloat probe</h3>
        <p className="text-sm text-text-muted leading-snug">
          Measures idle ping vs ping while a 30 MB download streams. The delta
          is what kills voice + ranked games when something else uses the link.
          Lives in-app — your results never leave your machine.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={runProbe}
          disabled={running || !isNative}
          className="btn-chrome px-4 py-1.5 rounded-md bg-accent text-bg-base text-sm font-semibold disabled:opacity-50"
        >
          {running ? 'Probing… (~14 s)' : report ? 'Re-run probe' : 'Run probe'}
        </button>
        <span className="text-xs text-text-subtle">
          target: 1.1.1.1 · download: speed.cloudflare.com /__down
        </span>
      </div>

      {err && !report && <div className="text-sm text-accent">{err}</div>}

      {report && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <Stat label="Idle p50" value={fmtMs(report.idleP50Ms)} hint={`${report.idlePingsMs.length} samples`} />
          <Stat
            label="Loaded p50"
            value={fmtMs(report.loadedP50Ms)}
            hint={`${report.loadedPingsMs.length} samples · ${humanBytes(report.bytesDownloaded)} downloaded`}
            warn={(report.deltaMs ?? 0) >= 60}
          />
          <GradeStat report={report} />
        </div>
      )}

      {report && (
        <p className="text-xs text-text-muted leading-snug">
          {GRADE_BLURBS[report.grade] ?? GRADE_BLURBS['—']}
        </p>
      )}

      <div className="pt-2 border-t border-border text-[11px] text-text-subtle">
        <span className="uppercase tracking-widest mr-2">Deeper test:</span>
        <a className="underline hover:text-text mr-3" href="https://www.waveform.com/tools/bufferbloat" target="_blank" rel="noreferrer">
          Waveform ↗
        </a>
        <a className="underline hover:text-text mr-3" href="https://www.dslreports.com/speedtest" target="_blank" rel="noreferrer">
          DSLReports ↗
        </a>
        <a className="underline hover:text-text mr-3" href="https://fast.com/" target="_blank" rel="noreferrer">
          fast.com ↗
        </a>
        <a className="underline hover:text-text" href="https://www.speedtest.net/apps/cli" target="_blank" rel="noreferrer">
          Ookla CLI ↗
        </a>
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
  warn,
}: {
  label: string
  value: string
  hint?: string
  warn?: boolean
}) {
  return (
    <div className="surface-card p-3">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${warn ? 'text-accent' : 'text-text'}`}>{value}</p>
      {hint && <p className="text-[10px] text-text-subtle mt-1">{hint}</p>}
    </div>
  )
}

function GradeStat({ report }: { report: BufferbloatReport }) {
  const color =
    report.grade === 'A'
      ? 'text-emerald-400'
      : report.grade === 'B'
      ? 'text-emerald-300'
      : report.grade === 'C'
      ? 'text-amber-400'
      : report.grade === 'D' || report.grade === 'F'
      ? 'text-accent'
      : 'text-text-muted'
  const deltaText =
    report.deltaMs == null
      ? '—'
      : report.deltaMs >= 0
      ? `+${report.deltaMs} ms under load`
      : `${report.deltaMs} ms under load`
  return (
    <div className="surface-card p-3">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">Grade</p>
      <p className={`text-3xl font-bold ${color}`}>{report.grade}</p>
      <p className="text-[10px] text-text-subtle mt-1">{deltaText}</p>
    </div>
  )
}

function fmtMs(v: number | null): string {
  if (v == null) return '—'
  return `${v} ms`
}

function humanBytes(n: number): string {
  if (n <= 0) return '0 B'
  const mb = n / 1_048_576
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  const kb = n / 1024
  return `${kb.toFixed(0)} KB`
}
