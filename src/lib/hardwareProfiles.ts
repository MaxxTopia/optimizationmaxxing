import type { BiosAudit, SpdReport, SpecProfile } from './tauri'
import {
  BOARD_EVIDENCE_PROFILES,
  resolveBoardEvidence,
  type BoardEvidenceProfile,
  type CpuSupportStatus,
} from './biosEvidenceCatalog'

export interface HardwareProfileRecord {
  id: string
  boardId: string
  boardLabel: string
  cpuVendor: 'AMD' | 'Intel'
  cpuModels: string[]
  biosSettingPaths: string[]
  memoryPolicy: 'rated-profile-only'
  tuningPolicy: string
  lastChecked: string
}

/**
 * The database is intentionally generated from the same exact-board evidence
 * records used by the BIOS audit. That prevents a second, looser motherboard
 * matcher from inventing BIOS options. Adding a record requires OEM evidence;
 * an unknown board remains unknown rather than receiving a guessed recipe.
 */
export const HARDWARE_PROFILE_CATALOG: HardwareProfileRecord[] = BOARD_EVIDENCE_PROFILES.map(
  (profile: BoardEvidenceProfile) => ({
    id: `hardware-${profile.id}`,
    boardId: profile.id,
    boardLabel: `${profile.manufacturer} ${profile.product}`,
    cpuVendor: profile.cpuVendor,
    cpuModels: profile.cpuSupportEvidence.map((entry) => entry.model),
    biosSettingPaths: profile.settings.map((setting) => setting.menuPath),
    memoryPolicy: 'rated-profile-only',
    tuningPolicy: 'Use only exact-kit, QVL-supported settings; no automatic timing or voltage writes.',
    lastChecked: profile.checkedOn,
  }),
)

export type HardwareProfileStatus = 'exact-board' | 'board-known-cpu-uncurated' | 'unknown-board' | 'identity-incomplete'

export interface HardwareProfileResolution {
  status: HardwareProfileStatus
  profile: HardwareProfileRecord | null
  boardStatus: ReturnType<typeof resolveBoardEvidence>['boardMatchStatus']
  cpuStatus: CpuSupportStatus
  memoryIdentity: string | null
  memoryStatus: 'mapped' | 'kit-not-in-catalog' | 'not-read'
  recommendations: string[]
  manualFallback: string
}

export function resolveHardwareProfile(
  bios: BiosAudit,
  spec: SpecProfile,
  spd: SpdReport | null,
): HardwareProfileResolution {
  const board = resolveBoardEvidence(bios)
  const profile = board.profile
    ? HARDWARE_PROFILE_CATALOG.find((candidate) => candidate.boardId === board.profile?.id) ?? null
    : null
  const memoryIdentity = spd?.dimms
    .map((dimm) => dimm.part)
    .filter((part): part is string => Boolean(part))
    .join(' + ') || null
  const recommendations: string[] = []

  if (profile) {
    recommendations.push(...profile.biosSettingPaths.slice(0, 6).map((path) => `Visible path to review: ${path}`))
    recommendations.push('Memory timings are not inferred from CPU model alone; validate the exact DIMM part number and stability.')
    recommendations.push('Leave voltage and thermal limits to the user-owned manual recipe lane; the automatic planner does not write them.')
  } else {
    recommendations.push('No exact board record is available. Do not copy a nearby board recipe.')
  }
  if (spec.ram.partNumber && !memoryIdentity) {
    recommendations.push(`Windows reports kit part ${spec.ram.partNumber}; read SPD to verify the module identity before memory tuning.`)
  }

  const status: HardwareProfileStatus = profile && board.cpuSupport.status === 'listed'
    ? 'exact-board'
    : profile
      ? 'board-known-cpu-uncurated'
      : board.boardMatchStatus === 'identity-incomplete'
        ? 'identity-incomplete'
        : 'unknown-board'

  return {
    status,
    profile,
    boardStatus: board.boardMatchStatus,
    cpuStatus: board.cpuSupport.status,
    memoryIdentity,
    memoryStatus: spd?.ok ? (memoryIdentity ? 'mapped' : 'kit-not-in-catalog') : 'not-read',
    recommendations,
    manualFallback: 'If the option is absent in the UI, export SCEWIN for this exact board, compare the selected option and value field, change it in BIOS, then re-dump after reboot. SCEWIN is never an automatic firmware writer.',
  }
}
