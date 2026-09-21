import type { BenchScored } from './astaBench'
import { type GameId } from './games'
import type { TweakAction } from './tauri'

/** A named capture contract keeps the lab and Match Scan talking about the
 * same process/evidence boundary. It does not launch or modify a game. */
export interface GameSessionProfile {
  id: string
  gameId: GameId
  label: string
  processNames: string[]
  evidenceSource: 'presentmon-plus-sensors'
  requiresBaseline: boolean
  restoreOnExit: boolean
  notes: string
}

export const GAME_SESSION_PROFILES: Record<GameId, GameSessionProfile> = {
  fortnite: {
    id: 'fortnite-closed-loop-v1',
    gameId: 'fortnite',
    label: 'Fortnite closed-loop capture',
    processNames: ['FortniteClient-Win64-Shipping.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Run the same replay or match scene before and after. PresentMon frame timing is evidence; it is not a direct click-to-pixel measurement.',
  },
  valorant: {
    id: 'valorant-closed-loop-v1',
    gameId: 'valorant',
    label: 'Valorant closed-loop capture',
    processNames: ['VALORANT-Win64-Shipping.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Keep the map, cap, Reflex/latency options, and background apps constant between captures.',
  },
  cs2: {
    id: 'cs2-closed-loop-v1',
    gameId: 'cs2',
    label: 'CS2 closed-loop capture',
    processNames: ['cs2.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Use the same demo or benchmark path. Do not mix online server variance with a local frametime conclusion.',
  },
  apex: {
    id: 'apex-closed-loop-v1',
    gameId: 'apex',
    label: 'Apex Legends closed-loop capture',
    processNames: ['r5apex.exe', 'r5apex_dx12.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Compare the same Firing Range route or replay conditions and keep the render API unchanged.',
  },
  warzone: {
    id: 'warzone-closed-loop-v1',
    gameId: 'warzone',
    label: 'Warzone closed-loop capture',
    processNames: ['cod.exe', 'modernwarfare.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Frame pacing and server latency are separate measurements; this capture only claims what it can observe locally.',
  },
  osu: {
    id: 'osu-closed-loop-v1',
    gameId: 'osu',
    label: 'osu! closed-loop capture',
    processNames: ['osu!.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Keep the same map and input device polling rate when comparing timing.',
  },
  overwatch: {
    id: 'overwatch-closed-loop-v1',
    gameId: 'overwatch',
    label: 'Overwatch 2 closed-loop capture',
    processNames: ['overwatch.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Use the same practice-range route and cap. Present mode and frametime tails matter more than average FPS alone.',
  },
  'marvel-rivals': {
    id: 'marvel-rivals-closed-loop-v1',
    gameId: 'marvel-rivals',
    label: 'Marvel Rivals closed-loop capture',
    processNames: ['Marvel-Win64-Shipping.exe'],
    evidenceSource: 'presentmon-plus-sensors',
    requiresBaseline: true,
    restoreOnExit: true,
    notes: 'Keep the render path and scene constant. Engine-family similarity is not proof of a Fortnite result.',
  },
}

export function sessionProfileFor(gameId: GameId): GameSessionProfile {
  return GAME_SESSION_PROFILES[gameId]
}

/** Transactional apply only accepts actions whose native engine can capture,
 * verify, and restore. PowerShell is opt-in because an arbitrary script can
 * mutate state that the app cannot prove or undo. */
export function isTransactionActionEligible(action: TweakAction): boolean {
  return action.kind !== 'powershell_script' || Boolean(action.revert?.trim() && action.verify?.trim())
}

export type EvidenceSource = 'asta-proxy' | 'presentmon'
export type EvidenceVerdict = 'insufficient' | 'candidate' | 'supported' | 'no-signal' | 'regression'

export interface ClosedLoopEvidence {
  verdict: EvidenceVerdict
  source: EvidenceSource
  baselineRuns: number
  afterRuns: number
  compositeDelta: number
  cpuDeltaNs: number
  dpcDeltaPct: number
  pingDeltaMs: number
  frameDeltaMs: number
  improvedMetrics: number
  regressedMetrics: number
  explanation: string
}

/**
 * Convert the existing Asta result into a closed-loop verdict. The proxy lane
 * can identify a candidate change, but only the PresentMon lane can report a
 * supported game frametime result. Lower is better for the component deltas;
 * higher is better for the composite score.
 */
export function evaluateClosedLoop(
  baseline: BenchScored | null,
  after: BenchScored | null,
  options: {
    source?: EvidenceSource
    baselineRuns?: number
    afterRuns?: number
  } = {},
): ClosedLoopEvidence {
  const source = options.source ?? 'asta-proxy'
  const baselineRuns = options.baselineRuns ?? 0
  const afterRuns = options.afterRuns ?? 0
  if (!baseline || !after) {
    return {
      verdict: 'insufficient',
      source,
      baselineRuns,
      afterRuns,
      compositeDelta: 0,
      cpuDeltaNs: 0,
      dpcDeltaPct: 0,
      pingDeltaMs: 0,
      frameDeltaMs: 0,
      improvedMetrics: 0,
      regressedMetrics: 0,
      explanation: 'Capture a baseline and an after result before judging a change.',
    }
  }

  const compositeDelta = after.composite - baseline.composite
  const cpuDeltaNs = after.cpu.nsPerIter - baseline.cpu.nsPerIter
  const dpcDeltaPct = after.dpc.totalDpcPercent - baseline.dpc.totalDpcPercent
  const pingDeltaMs = (after.ping.stddevMs ?? 0) - (baseline.ping.stddevMs ?? 0)
  const frameDeltaMs = after.framePaceStddevMs - baseline.framePaceStddevMs
  const improvements = [cpuDeltaNs < -0.5, dpcDeltaPct < -0.05, pingDeltaMs < -0.05, frameDeltaMs < -0.02]
  const regressions = [cpuDeltaNs > 0.5, dpcDeltaPct > 0.05, pingDeltaMs > 0.05, frameDeltaMs > 0.02]
  const improvedMetrics = improvements.filter(Boolean).length
  const regressedMetrics = regressions.filter(Boolean).length

  let verdict: EvidenceVerdict
  let explanation: string
  if (baselineRuns < 3 || afterRuns < 3) {
    verdict = 'insufficient'
    explanation = 'Repeat each side at least three times under the same scene and power state before making a keep/discard decision.'
  } else if (compositeDelta <= -0.75 || regressedMetrics >= 3) {
    verdict = 'regression'
    explanation = 'The measured composite or several component metrics regressed. Revert the change and keep the receipt for investigation.'
  } else if (source === 'presentmon' && compositeDelta >= 1 && improvedMetrics >= 2) {
    verdict = 'supported'
    explanation = 'The game capture and at least two supporting metrics improved. Repeat after a reboot before calling the setting persistent.'
  } else if (compositeDelta >= 0.5 && improvedMetrics >= 2) {
    verdict = 'candidate'
    explanation = source === 'asta-proxy'
      ? 'The local proxy improved, so this is a candidate for a Fortnite capture; it is not proof of lower input-to-photon latency.'
      : 'The capture improved enough to keep as a candidate, but the effect should be repeated on another scene.'
  } else {
    verdict = 'no-signal'
    explanation = 'The change did not clear the evidence threshold. Keep the default unless the actual game capture shows a repeatable benefit.'
  }

  return {
    verdict,
    source,
    baselineRuns,
    afterRuns,
    compositeDelta,
    cpuDeltaNs,
    dpcDeltaPct,
    pingDeltaMs,
    frameDeltaMs,
    improvedMetrics,
    regressedMetrics,
    explanation,
  }
}
