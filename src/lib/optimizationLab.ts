import type { BenchScored } from './astaBench'
import { isExperimentalTweak, tweakMatchesSpec, type TweakRecord } from './catalog'
import type { GameId } from './games'
import { isHardBlockedForAutoTune, tuneProfile, type TuneIntensity } from './tuneProfiles'
import type { BoardEvidenceResolution } from './biosEvidenceCatalog'
import type {
  AppliedTweak,
  BiosAudit,
  DpcSnapshot,
  DriverHealthReport,
  NetworkAudit,
  PerfSnapshot,
  RebootValidation,
  SpdReport,
  SpecProfile,
} from './tauri'
import { resolveBoardEvidence } from './biosEvidenceCatalog'

/** The planner is intentionally separate from Tune Now. Tune Now answers
 * "what can be applied automatically?" The lab answers "what exists on this
 * rig, what is proven, and what needs an explicit decision?" */
export type LabPlanState =
  | 'ready'
  | 'vip'
  | 'manual'
  | 'review'
  | 'held'
  | 'applied'
  | 'drifted'
  | 'not-matched'
  | 'other-game'
  | 'needs-scan'

export interface LabPlanRow {
  tweak: TweakRecord
  state: LabPlanState
  reason: string
  experimental: boolean
  hardBlocked: boolean
}

export interface LabPlanCounts {
  ready: number
  vip: number
  manual: number
  review: number
  held: number
  applied: number
  drifted: number
  notMatched: number
  otherGame: number
  needsScan: number
}

export interface LabPlanSummary {
  profile: ReturnType<typeof tuneProfile>
  rows: LabPlanRow[]
  counts: LabPlanCounts
}

export interface OptimizationPlanInput {
  tweaks: TweakRecord[]
  spec: SpecProfile | null
  applied: AppliedTweak[]
  isVip: boolean
  level: TuneIntensity
  targetGame: GameId | 'any'
}

function emptyCounts(): LabPlanCounts {
  return {
    ready: 0,
    vip: 0,
    manual: 0,
    review: 0,
    held: 0,
    applied: 0,
    drifted: 0,
    notMatched: 0,
    otherGame: 0,
    needsScan: 0,
  }
}

function hasSelectedGame(tweak: TweakRecord, targetGame: GameId | 'any'): boolean {
  return targetGame === 'any' || !tweak.applicableGames?.length || tweak.applicableGames.includes(targetGame)
}

function isManualFirmwareRecipe(tweak: TweakRecord): boolean {
  return tweak.category === 'bios' || /\b(?:xmp|expo|dram timing|memory timing|firmware)\b/i.test(tweak.title)
}

function latestApplied(applied: AppliedTweak[]): Map<string, AppliedTweak> {
  const result = new Map<string, AppliedTweak>()
  for (const item of applied) {
    const previous = result.get(item.tweakId)
    if (!previous || item.appliedAt >= previous.appliedAt) result.set(item.tweakId, item)
  }
  return result
}

/**
 * Build the full explainable plan. It deliberately keeps non-matches in the
 * result so the UI can say why a row did not make the current plan instead of
 * pretending the catalog has no opinion about that component.
 */
export function buildOptimizationPlan(input: OptimizationPlanInput): LabPlanSummary {
  const profile = tuneProfile(input.level)
  const appliedById = latestApplied(input.applied)
  const counts = emptyCounts()
  const rows = input.tweaks.map((tweak): LabPlanRow => {
    const experimental = isExperimentalTweak(tweak)
    const hardBlocked = isHardBlockedForAutoTune(tweak)
    const live = appliedById.get(tweak.id)
    let state: LabPlanState
    let reason: string

    if (!hasSelectedGame(tweak, input.targetGame)) {
      state = 'other-game'
      reason = 'Tagged for a different game; excluded from this plan.'
    } else if (!input.spec) {
      state = 'needs-scan'
      reason = 'Run the desktop scan before making a hardware-specific decision.'
    } else if (!tweakMatchesSpec(tweak, input.spec)) {
      state = 'not-matched'
      reason = 'The catalog target does not match the detected CPU, GPU, OS, memory, or form factor.'
    } else if (live?.status === 'applied' && live.verificationStatus === 'verified') {
      state = 'applied'
      reason = 'Applied receipt exists and the latest native read-back matches.'
    } else if (live?.status === 'applied' && live.verificationStatus === 'mismatch') {
      state = 'drifted'
      reason = 'A receipt exists, but native read-back found drift. Review before reapplying.'
    } else if (tweak.vipGate === 'vip' && !input.isVip) {
      state = 'vip'
      reason = 'VIP-gated: visible in the plan, locked from application on this tier.'
    } else if (isManualFirmwareRecipe(tweak)) {
      state = 'manual'
      reason = 'Manual firmware path: use the board-specific evidence and SCEWIN workflow; the app never writes BIOS/NVRAM.'
    } else if (hardBlocked) {
      state = 'review'
      reason = experimental
        ? 'Explicit review lane: security, anti-cheat, tournament, cosmetic, or unverified read-back tradeoff.'
        : 'Explicit review lane: the automatic planner will not apply this row without a per-tweak decision.'
    } else if (tweak.riskLevel > profile.maxRisk || (experimental && !profile.includeExperimental)) {
      state = 'held'
      reason = `Held above ${profile.label} policy: risk ${tweak.riskLevel}${experimental ? ' / experimental' : ''}.`
    } else {
      state = 'ready'
      reason = `Matches this rig and ${profile.label} policy; eligible for the existing Tune Now apply/read-back flow.`
    }

    switch (state) {
      case 'not-matched': counts.notMatched += 1; break
      case 'other-game': counts.otherGame += 1; break
      case 'needs-scan': counts.needsScan += 1; break
      case 'ready': counts.ready += 1; break
      case 'vip': counts.vip += 1; break
      case 'manual': counts.manual += 1; break
      case 'review': counts.review += 1; break
      case 'held': counts.held += 1; break
      case 'applied': counts.applied += 1; break
      case 'drifted': counts.drifted += 1; break
    }

    return { tweak, state, reason, experimental, hardBlocked }
  })

  return { profile, rows, counts }
}

export interface LabScan {
  spec: SpecProfile
  bios: BiosAudit | null
  network: NetworkAudit | null
  drivers: DriverHealthReport | null
  spd: SpdReport | null
  applied: AppliedTweak[]
  reboot: RebootValidation | null
  metrics: PerfSnapshot | null
  dpc: DpcSnapshot | null
  boardEvidence: BoardEvidenceResolution | null
  capturedAt: string
}

export interface LabScanInput {
  spec: SpecProfile
  bios?: BiosAudit | null
  network?: NetworkAudit | null
  drivers?: DriverHealthReport | null
  spd?: SpdReport | null
  applied?: AppliedTweak[]
  reboot?: RebootValidation | null
  metrics?: PerfSnapshot | null
  dpc?: DpcSnapshot | null
  capturedAt?: string
}

export function buildLabScan(input: LabScanInput): LabScan {
  const bios = input.bios ?? null
  return {
    spec: input.spec,
    bios,
    network: input.network ?? null,
    drivers: input.drivers ?? null,
    spd: input.spd ?? null,
    applied: input.applied ?? [],
    reboot: input.reboot ?? null,
    metrics: input.metrics ?? null,
    dpc: input.dpc ?? null,
    boardEvidence: bios ? resolveBoardEvidence(bios) : null,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  }
}

export type PassportState = 'detected' | 'measured' | 'manual' | 'unknown' | 'attention'

export interface RigPassportRow {
  id: string
  label: string
  value: string
  detail: string
  state: PassportState
}

function valueOrUnknown(value: string | number | null | undefined, fallback = 'Unknown'): string {
  return value == null || value === '' ? fallback : String(value)
}

function formatOs(spec: SpecProfile): string {
  const version = valueOrUnknown(spec.os.displayVersion, 'Windows')
  const build = spec.os.ubr == null ? `${spec.os.build}` : `${spec.os.build}.${spec.os.ubr}`
  return `${version} · build ${build}`
}

function boardEvidenceState(scan: LabScan): PassportState {
  const status = scan.boardEvidence?.boardMatchStatus
  return status === 'matched' ? 'measured' : status ? 'attention' : 'unknown'
}

function boardEvidenceDetail(scan: LabScan): string {
  if (!scan.boardEvidence) return 'BIOS audit unavailable; exact board settings are not inferred.'
  const { boardMatchStatus, cpuSupport } = scan.boardEvidence
  const cpu = cpuSupport.status === 'listed' ? 'CPU support is listed in the curated board evidence.' : 'CPU support still needs the board/OEM page check.'
  return `${boardMatchStatus}; ${cpu}`
}

function persistenceState(scan: LabScan): PassportState {
  if (!scan.reboot) return 'unknown'
  if (scan.reboot.status === 'mismatch' || scan.reboot.mismatched > 0) return 'attention'
  if (scan.reboot.status === 'verified') return 'measured'
  return 'manual'
}

function persistenceDetail(scan: LabScan): string {
  if (!scan.reboot) return 'No reboot receipt has been read.'
  if (scan.reboot.status === 'verified') return `${scan.reboot.verified}/${scan.reboot.checked} receipts matched after a real reboot.`
  if (scan.reboot.status === 'mismatch') return `${scan.reboot.mismatched} receipt(s) drifted after reboot; inspect Diff before reapplying.`
  return scan.reboot.detail || 'Arm a reboot proof, restart Windows, and let the next launch read the live state.'
}

/** Build a compact, privacy-conscious rig passport for the lab UI. */
export function buildRigPassportRows(scan: LabScan): RigPassportRow[] {
  const { spec } = scan
  const ramSpeed = spec.ram.configuredSpeedMts ?? spec.ram.speedMts
  const ramKit = [spec.ram.manufacturer, spec.ram.partNumber].filter(Boolean).join(' · ')
  const networkValue = scan.network
    ? `${valueOrUnknown(scan.network.mediaType)} · ${valueOrUnknown(scan.network.linkSpeedMbps, 'link unknown')} Mbps`
    : 'Not scanned'
  const driverValue = scan.drivers
    ? scan.drivers.knownBadCount > 0 ? `${scan.drivers.knownBadCount} flagged driver(s)` : 'No bundled known-bad match'
    : 'Not scanned'
  const spdValue = scan.spd
    ? scan.spd.ok ? `${scan.spd.dimms.length} DIMM(s) · ${scan.spd.busCount} bus(es)` : 'SPD read failed'
    : 'Not read'

  return [
    {
      id: 'cpu',
      label: 'CPU',
      value: `${valueOrUnknown(spec.cpu.marketing || spec.cpu.model)} · ${spec.cpu.cores}c/${spec.cpu.logicalCores}t`,
      detail: `Vendor ${valueOrUnknown(spec.cpu.vendor)}; generation ${valueOrUnknown(spec.cpu.genOrZen)}`,
      state: 'detected',
    },
    {
      id: 'gpu',
      label: 'GPU',
      value: valueOrUnknown(spec.gpu.model),
      detail: `${valueOrUnknown(spec.gpu.vramMb, 'VRAM unknown')} MB VRAM · driver ${valueOrUnknown(spec.gpu.driverVersion)}`,
      state: 'detected',
    },
    {
      id: 'memory',
      label: 'Memory kit',
      value: `${spec.ram.totalGb} GB · ${valueOrUnknown(ramSpeed, 'speed unknown')} MT/s configured`,
      detail: `${ramKit || 'Kit identity not reported'} · ${spec.ram.stickCount} stick(s). SPD die/headroom is not inferred from WMI.`,
      state: scan.spd ? 'measured' : 'manual',
    },
    {
      id: 'board',
      label: 'Board / BIOS',
      value: `${valueOrUnknown(spec.mobo.manufacturer)} ${valueOrUnknown(spec.mobo.product)}`,
      detail: `${valueOrUnknown(spec.mobo.biosVendor)} ${valueOrUnknown(spec.mobo.biosVersion)} · ${boardEvidenceDetail(scan)}`,
      state: boardEvidenceState(scan),
    },
    {
      id: 'os',
      label: 'Windows',
      value: formatOs(spec),
      detail: `${valueOrUnknown(spec.os.edition)} · captured ${new Date(scan.capturedAt).toLocaleString()}`,
      state: 'detected',
    },
    {
      id: 'network',
      label: 'Network path',
      value: networkValue,
      detail: scan.network?.gatewayRttMs == null
        ? 'Gateway/public route details unavailable; this is not a Fortnite server ping.'
        : `Gateway RTT ${scan.network.gatewayRttMs.toFixed(1)} ms · CGNAT ${scan.network.cgnat == null ? 'unknown' : scan.network.cgnat ? 'yes' : 'no'}`,
      state: scan.network ? 'measured' : 'unknown',
    },
    {
      id: 'drivers',
      label: 'Driver health',
      value: driverValue,
      detail: scan.drivers?.note || 'Run the native driver probe to compare versions and known-bad matches.',
      state: scan.drivers?.knownBadCount ? 'attention' : scan.drivers ? 'measured' : 'unknown',
    },
    {
      id: 'spd',
      label: 'SPD / memory evidence',
      value: spdValue,
      detail: scan.spd?.error || 'Optional elevated read-only probe; it can install PawnIO and exposes kit/die inputs, not guaranteed overclock headroom.',
      state: scan.spd ? (scan.spd.ok ? 'measured' : 'attention') : 'manual',
    },
    {
      id: 'persistence',
      label: 'Reboot persistence',
      value: scan.reboot?.status ?? 'Not checked',
      detail: persistenceDetail(scan),
      state: persistenceState(scan),
    },
  ]
}

export interface PersistedLabSummary {
  capturedAt: string
  cpu: string
  gpu: string
  memory: string
  board: string
  os: string
  appliedCount: number
  verifiedCount: number
  rebootStatus: string
}

/** Persist only useful labels and counts; never serials, UUIDs, MACs, or IPs. */
export function redactLabScan(scan: LabScan): PersistedLabSummary {
  const rows = buildRigPassportRows(scan)
  const value = (id: string) => rows.find((row) => row.id === id)?.value ?? 'Unknown'
  return {
    capturedAt: scan.capturedAt,
    cpu: value('cpu'),
    gpu: value('gpu'),
    memory: value('memory'),
    board: value('board'),
    os: value('os'),
    appliedCount: scan.applied.filter((item) => item.status === 'applied').length,
    verifiedCount: scan.applied.filter((item) => item.status === 'applied' && item.verificationStatus === 'verified').length,
    rebootStatus: scan.reboot?.status ?? 'unknown',
  }
}

export interface BenchComparison {
  compositeDelta: number
  cpuDeltaNs: number
  dpcDeltaPct: number
  pingDeltaMs: number
  frameDeltaMs: number
}

export function compareBench(before: BenchScored | null, after: BenchScored | null): BenchComparison | null {
  if (!before || !after) return null
  return {
    compositeDelta: after.composite - before.composite,
    cpuDeltaNs: after.cpu.nsPerIter - before.cpu.nsPerIter,
    dpcDeltaPct: after.dpc.totalDpcPercent - before.dpc.totalDpcPercent,
    pingDeltaMs: (after.ping.stddevMs ?? 0) - (before.ping.stddevMs ?? 0),
    frameDeltaMs: after.framePaceStddevMs - before.framePaceStddevMs,
  }
}

export function formatSigned(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`
}
