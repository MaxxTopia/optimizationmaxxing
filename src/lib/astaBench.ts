/**
 * Shared Asta Bench runner. /benchmark page + per-tweak impact flow both
 * call this — keeps scoring consistent across surfaces.
 */
import { benchCpu, benchPing, dpcSnapshot, type CpuLatencySample, type PingJitterSample, type DpcSnapshot } from './tauri'

export type BenchStage = 'idle' | 'cpu' | 'dpc' | 'ping' | 'frame' | 'done'

export interface BenchSample {
  cpu: CpuLatencySample
  dpc: DpcSnapshot
  ping: PingJitterSample
  framePaceStddevMs: number
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
export function scorePing(stddevMs: number): number {
  return Math.max(0, Math.min(20, 20 - stddevMs * 2.5))
}
export function scoreFrame(stddevMs: number): number {
  return Math.max(0, Math.min(30, 30 - stddevMs * 7.5))
}

export function score(sample: BenchSample): BenchScored {
  const sCpu = scoreCpu(sample.cpu.nsPerIter)
  const sDpc = scoreDpc(sample.dpc.totalDpcPercent)
  const sPing = scorePing(sample.ping.stddevMs ?? 0)
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
