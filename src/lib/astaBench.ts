/**
 * Shared Asta Bench runner. /benchmark page + per-tweak impact flow both
 * call this — keeps scoring consistent across surfaces.
 */
import { benchCpu, benchPing, dpcSnapshot, type CpuLatencySample, type PingJitterSample, type DpcSnapshot } from './tauri'
import { median, summarizeRunDistribution } from './benchMath'

export type BenchStage = 'idle' | 'cpu' | 'dpc' | 'ping' | 'frame' | 'done'

export interface BenchSample {
  cpu: CpuLatencySample
  dpc: DpcSnapshot
  ping: PingJitterSample
  framePaceStddevMs: number
  /** Distribution metadata from runBenchMedian; absent for a single run. */
  runCount?: number
  runSpread?: number
  runMad?: number
  runComposites?: number[]
}

export interface BenchScored extends BenchSample {
  scoreCpu: number
  scoreDpc: number
  scorePing: number
  scoreFrame: number
  composite: number
}

export const PING_TARGET = '1.1.1.1'
export const PING_COUNT = 30
// A standard run asks for 30 samples. Fewer than ten successful replies is
// too sparse to call the jitter comparison meaningful; keep the metric
// unknown instead of letting a small sample make a noisy change look proven.
export const MIN_PING_SAMPLES = 10
export const FRAME_TEST_MS = 10000

/** Run all 4 metrics in sequence. `onStage` lets the caller render per-stage progress. */
export async function runBench(onStage?: (s: BenchStage) => void): Promise<BenchSample> {
  onStage?.('cpu')
  const cpu = await benchCpu()
  onStage?.('dpc')
  const dpc = await dpcSnapshot()
  onStage?.('ping')
  const ping = await benchPing(PING_TARGET, PING_COUNT)
  onStage?.('frame')
  const framePaceStddevMs = await runFramePaceTest(FRAME_TEST_MS)
  onStage?.('done')
  return { cpu, dpc, ping, framePaceStddevMs }
}

/** Browser-side rAF jitter test. Same DWM compositor Fortnite renders through. */
export function runFramePaceTest(durationMs: number): Promise<number> {
  const samples: number[] = []
  let last = performance.now()
  const end = last + durationMs
  return new Promise<number>((resolve) => {
    function tick(now: number) {
      const dt = now - last
      last = now
      samples.push(dt)
      if (now < end) {
        requestAnimationFrame(tick)
      } else {
        // Trim outer 5% to ignore tab-switch outliers.
        samples.sort((a, b) => a - b)
        const trim = Math.floor(samples.length * 0.05)
        const trimmed = samples.slice(trim, samples.length - trim)
        const mean = trimmed.reduce((a, b) => a + b, 0) / trimmed.length
        const variance =
          trimmed.reduce((a, b) => a + (b - mean) * (b - mean), 0) / trimmed.length
        resolve(Math.sqrt(variance))
      }
    }
    requestAnimationFrame(tick)
  })
}

export function scoreCpu(nsPerIter: number): number {
  return Math.max(0, Math.min(25, (200 - nsPerIter) / 6))
}
export function scoreDpc(pct: number): number {
  return Math.max(0, Math.min(25, 25 - pct * 5))
}
export function scorePing(stddevMs: number | null | undefined): number {
  // Missing jitter is unknown, not zero jitter. Treating an unavailable
  // probe as perfect can make a partial benchmark look like an improvement.
  if (!Number.isFinite(stddevMs ?? Number.NaN)) return 0
  return Math.max(0, Math.min(20, 20 - (stddevMs as number) * 2.5))
}
export function scoreFrame(stddevMs: number): number {
  return Math.max(0, Math.min(30, 30 - stddevMs * 7.5))
}

export function score(sample: BenchSample): BenchScored {
  const sCpu = scoreCpu(sample.cpu.nsPerIter)
  const sDpc = scoreDpc(sample.dpc.totalDpcPercent)
  const sPing = scorePing(sample.ping.stddevMs)
  const sFrame = scoreFrame(sample.framePaceStddevMs)
  return {
    ...sample,
    scoreCpu: sCpu,
    scoreDpc: sDpc,
    scorePing: sPing,
    scoreFrame: sFrame,
    composite: sCpu + sDpc + sPing + sFrame,
  }
}

/** Run the bench N times and return a synthetic sample where every
 * metric is the median across runs. Cuts run-to-run variance from ~3-4
 * composite points down to ~1 — much more trustworthy for per-tweak
 * before/after measurements.
 *
 * `onRun(idx, total)` fires before each run; `onStage` is the per-run
 * stage callback, identical to `runBench`. */
export async function runBenchMedian(
  n: number,
  onRun?: (idx: number, total: number) => void,
  onStage?: (s: BenchStage) => void,
): Promise<BenchSample> {
  if (n < 1) throw new Error('runBenchMedian: n must be >= 1')
  const samples: BenchSample[] = []
  for (let i = 0; i < n; i++) {
    onRun?.(i + 1, n)
    samples.push(await runBench(onStage))
  }
  // Build a synthetic sample from per-metric medians. We carry through
  // one of the cpu/dpc/ping objects' shape but overwrite the numbers we
  // actually score on — the scoring code only reads nsPerIter / totalDpcPercent /
  // stddevMs / framePaceStddevMs.
  const cpuNs = median(samples.map((s) => s.cpu.nsPerIter))
  const dpcPct = median(samples.map((s) => s.dpc.totalDpcPercent))
  const pingCoverageSufficient = samples.every((sample) => sample.ping.samples.length >= MIN_PING_SAMPLES)
  const validPingStddev = pingCoverageSufficient
    ? samples
      .map((s) => s.ping.stddevMs)
      .filter((value): value is number => Number.isFinite(value))
    : []
  const validPingP50 = pingCoverageSufficient
    ? samples
      .map((s) => s.ping.p50Ms)
      .filter((value): value is number => Number.isFinite(value))
    : []
  // Preserve an unavailable metric as unavailable. A missing ICMP sample must
  // never become a synthetic 0 ms result in the median or composite score.
  const pingStddev = validPingStddev.length > 0 ? median(validPingStddev) : null
  const pingP50 = validPingP50.length > 0 ? median(validPingP50) : null
  const frame = median(samples.map((s) => s.framePaceStddevMs))
  const runComposites = samples.map((sample) => score(sample).composite)
  const distribution = summarizeRunDistribution(runComposites)
  const last = samples[samples.length - 1]
  return {
    cpu: { ...last.cpu, nsPerIter: cpuNs },
    dpc: { ...last.dpc, totalDpcPercent: dpcPct },
    ping: { ...last.ping, stddevMs: pingStddev, p50Ms: pingP50 },
    framePaceStddevMs: frame,
    runCount: distribution.count,
    runSpread: distribution.spread,
    runMad: distribution.mad,
    runComposites,
  }
}
