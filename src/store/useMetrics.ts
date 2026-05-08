import { useEffect, useState } from 'react'
import { systemMetrics, type PerfSnapshot } from '../lib/tauri'

/** Polls the Rust system_metrics command. Designed for ring-gauge dashboards.
 *  In browser preview (no Tauri runtime) it short-circuits and returns null,
 *  so dashboard ring gauges stay at 0 instead of console-erroring on each tick.
 */
export function useMetrics(intervalMs = 2000): PerfSnapshot | null {
  const [snap, setSnap] = useState<PerfSnapshot | null>(null)

  useEffect(() => {
    // @ts-expect-error Tauri injects this at runtime
    const inTauri = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
    if (!inTauri) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function tick() {
      try {
        const s = await systemMetrics()
        if (!cancelled) setSnap(s)
      } catch {
        return
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }

    tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [intervalMs])

  return snap
}
