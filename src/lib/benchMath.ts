/**
 * Pure benchmark-distribution helpers.
 *
 * Keeping these calculations free of browser/native imports makes them easy
 * to test and keeps the Asta measurement contract separate from the probes
 * that collect the samples.
 */

export interface RunDistribution {
  median: number
  spread: number
  mad: number
  count: number
}

/** Return the median of finite values. */
export function median(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) throw new Error('median: at least one finite value is required')
  const sorted = finite.slice().sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Summarize the composite produced by each individual run.
 *
 * `spread` is the full max-min range. `mad` is the median absolute deviation
 * from the median and is the better indicator of the usual run-to-run noise.
 */
export function summarizeRunDistribution(values: number[]): RunDistribution {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) throw new Error('summarizeRunDistribution: at least one finite value is required')
  const middle = median(finite)
  const deviations = finite.map((value) => Math.abs(value - middle))
  return {
    median: middle,
    spread: Math.max(...finite) - Math.min(...finite),
    mad: median(deviations),
    count: finite.length,
  }
}

/**
 * A conservative display-only noise floor for a before/after comparison.
 * This does not change Asta's rollback threshold; it tells the user when the
 * observed delta is too close to normal local measurement variation to call.
 */
export function measurementNoiseFloor(
  before: { mad?: number; spread?: number } | null | undefined,
  after: { mad?: number; spread?: number } | null | undefined,
): number | null {
  if (!before || !after) return null
  const mad = Math.max(before.mad ?? 0, after.mad ?? 0)
  const halfSpread = Math.max(before.spread ?? 0, after.spread ?? 0) / 2
  return Math.max(1, mad * 2, halfSpread)
}
