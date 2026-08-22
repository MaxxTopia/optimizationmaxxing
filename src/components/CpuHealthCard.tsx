import { useState } from 'react'
import { cpuHealthCancel, cpuHealthTest, inTauri, type CpuHealthResult } from '../lib/tauri'

/**
 * One-click CPU stability screen. The copy is deliberately less technical
 * than the microcode card: users need a clear stop/continue signal, not a
 * fake medical diagnosis for silicon.
 */
export function CpuHealthCard() {
  const isNative = inTauri()
  const [duration, setDuration] = useState(60)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CpuHealthResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!isNative) {
      setError('CPU Health requires the optimizationmaxxing.exe shell.')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      setResult(await cpuHealthTest(duration))
    } catch (e) {
      setError(formatErr(e))
    } finally {
      setRunning(false)
    }
  }

  async function cancel() {
    try {
      await cpuHealthCancel()
    } catch (e) {
      setError(formatErr(e))
    }
  }

  const tone = result?.status === 'fail'
    ? 'border-red-500/70 bg-red-500/10'
    : result?.status === 'warning'
    ? 'border-amber-500/60 bg-amber-500/10'
    : result?.status === 'pass'
    ? 'border-emerald-500/50 bg-emerald-500/5'
    : result?.status === 'cancelled'
    ? 'border-border bg-bg-raised/40'
    : ''

  return (
    <section className={`surface-card p-5 space-y-3 ${tone}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">health check</p>
          <h2 className="text-lg font-semibold">CPU Health Screen</h2>
          <p className="text-xs text-text-muted leading-snug max-w-2xl mt-1">
            Click once, wait, and we put the CPU under a bounded Windows workload while watching
            for workload failures and new WHEA hardware errors. Intel users get the same screen;
            the Intel-specific microcode guidance stays above.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={running || !isNative}
            className="px-2 py-1.5 rounded-md bg-bg-card border border-border text-xs"
            aria-label="CPU screen duration"
          >
            <option value={60}>60 seconds</option>
            <option value={180}>3 minutes</option>
          </select>
          <button
            onClick={running ? cancel : run}
            disabled={!isNative}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold disabled:opacity-40 ${running ? 'border border-amber-400/60 text-amber-200 bg-amber-500/10' : 'bg-accent text-bg-base'}`}
          >
            {running ? 'Stop screen' : `Start ${duration}s screen`}
          </button>
        </div>
      </div>

      {running && (
        <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs text-text-muted">
          CPU load is intentional. Close games and unsaved work, keep cooling visible, and use Stop
          screen if temperatures or noise become unsafe. The app will report when the window finishes.
          <div className="h-1 bg-bg-raised rounded overflow-hidden mt-2">
            <div className="h-full w-1/3 bg-accent animate-pulse" />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-300">{error}</p>}

      {result && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs uppercase tracking-widest px-2 py-1 rounded border font-semibold ${
                result.status === 'pass'
                  ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10'
                  : result.status === 'warning'
                  ? 'border-amber-500/50 text-amber-200 bg-amber-500/10'
                  : result.status === 'cancelled'
                  ? 'border-border text-text-muted bg-bg-raised/60'
                  : 'border-red-500/60 text-red-300 bg-red-500/10'
              }`}
            >
              {result.status === 'pass' ? 'screen clear' : result.status === 'warning' ? 'investigate' : result.status === 'cancelled' ? 'stopped' : 'failed'}
            </span>
            <strong className="text-sm text-text">{result.headline}</strong>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Mini label="CPU" value={result.cpuBrand || 'Unknown'} />
            <Mini label="Workers" value={`${result.workers} logical`} />
            <Mini label="Work done" value={result.iterations.toLocaleString()} />
            <Mini label="New WHEA" value={result.wheaDelta == null ? 'not readable' : String(result.wheaDelta)} />
          </div>
          <p className="text-[11px] text-text-muted leading-snug">{result.note}</p>
        </>
      )}

      <p className="text-[11px] text-text-subtle leading-snug border-t border-border pt-2">
        A clean result means “nothing failed during this window,” not “the chip is proven healthy.”
        If this flags, return BIOS and memory to stock before changing more settings. Do not treat
        this screen as a replacement for Intel Processor Diagnostic Tool, OCCT, MemTest86, or a
        vendor warranty decision.
      </p>
    </section>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-2 min-w-0">
      <p className="text-[10px] uppercase tracking-widest text-text-subtle">{label}</p>
      <p className="text-xs text-text truncate" title={value}>{value}</p>
    </div>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
