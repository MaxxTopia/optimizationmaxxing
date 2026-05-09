/**
 * Per-tweak impact measurement. Persists measured deltas keyed by tweakId
 * so the catalog row can show a real "this tweak gave you +0.8 score"
 * line under the title — empirical, not vibes.
 *
 * Composing the bench: callers pass a runner closure that fires Asta
 * Bench's component metrics (CPU + DPC + ping + frame-pace) and returns
 * a composite. We don't import Benchmark.tsx directly to avoid a cyclic
 * page-→-component dep — the runner stays in the calling component.
 */

const STORE_KEY = 'optmaxxing-tweak-impact-by-id'

export interface TweakImpactRow {
  tweakId: string
  /** ISO timestamp the measurement was taken. */
  ts: string
  /** Composite score before the tweak was applied. */
  beforeComposite: number
  /** Composite score after the tweak was applied + caches settled. */
  afterComposite: number
  /** Convenience: after - before. Positive = tweak helped. */
  delta: number
  /** Optional per-metric deltas for richer display. */
  cpuDeltaNs?: number
  dpcDelta?: number
  pingStddevDelta?: number
  framePaceStddevDelta?: number
}

export function loadImpactStore(): Record<string, TweakImpactRow> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

export function saveImpact(row: TweakImpactRow): void {
  const store = loadImpactStore()
  store[row.tweakId] = row
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

export function getImpactFor(tweakId: string): TweakImpactRow | null {
  const store = loadImpactStore()
  return store[tweakId] ?? null
}

export function clearImpactFor(tweakId: string): void {
  const store = loadImpactStore()
  delete store[tweakId]
  localStorage.setItem(STORE_KEY, JSON.stringify(store))
}

/** Whether the user has agreed to measure-on-apply by default. Persists
 * after first prompt so we don't re-ask for every Apply. */
const PREF_KEY = 'optmaxxing-tweak-impact-pref'
export type ImpactPref = 'always' | 'never' | 'ask'

export function loadImpactPref(): ImpactPref {
  const v = localStorage.getItem(PREF_KEY)
  if (v === 'always' || v === 'never') return v
  return 'ask'
}
export function setImpactPref(v: ImpactPref): void {
  localStorage.setItem(PREF_KEY, v)
}
