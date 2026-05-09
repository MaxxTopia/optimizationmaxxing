/**
 * Catalog loader. v1.0.0-pilot ships baked into the bundle as
 * `resources/catalog/v1.json` (vite copies via /resources path).
 * Phase 9 adds signed remote-fetch updates.
 */
import catalogData from '../../resources/catalog/v1.json'
import type { TweakAction } from './tauri'
import type { GameId } from './games'

export type TweakCategory =
  | 'registry'
  | 'bcd'
  | 'powerplan'
  | 'network'
  | 'nvidia'
  | 'bios'
  | 'process'
  | 'timer'
  | 'ram'
  | 'monitor'

/** Optional rig-targeting metadata. Used by the Dashboard recommendation
 * engine — a tweak with `targets.cpuVendor: ["amd"]` only gets recommended on
 * AMD rigs. Absent fields = applies to every rig. */
export interface TweakTargets {
  /** "amd" | "intel". If set, tweak only matches when SpecProfile.cpu.vendor matches. */
  cpuVendor?: ('amd' | 'intel')[]
  /** "nvidia" | "amd" | "intel". Matches against SpecProfile.gpu.vendor. */
  gpuVendor?: ('nvidia' | 'amd' | 'intel')[]
  /** Lowest Win10/11 build that supports this tweak (e.g., 22000 = Win11). */
  osMinBuild?: number
  /** Highest Win10/11 build (e.g., < 19045 if the tweak was deprecated). */
  osMaxBuild?: number
  /** Minimum total RAM in GB. Used to gate RAM-heavy tweaks like MMAgent off. */
  ramMinGb?: number
  /** "desktop" | "laptop". Used to gate battery-hostile tweaks (PCIe ASPM off,
   * core parking off, USB-3 link power off) so laptop users don't melt their
   * battery. Reads SpecProfile.mobo.isLaptop. */
  formFactor?: ('desktop' | 'laptop')[]
}

/** Tournament-compliance verdict for a single game/anticheat. Used to flag
 * tweaks that would break eligibility for ranked / FNCS / VCT / etc. */
export type ComplianceVerdict = 'safe' | 'risk' | 'breaks'

/** Per-game compliance map. Indexed by GameId so we can read it dynamically
 * via the active game-filter chip without TS index errors. Games with no
 * tournament concept (e.g. osu!) simply stay omitted. */
export type TournamentCompliance = Partial<Record<GameId, ComplianceVerdict>>

export interface TweakRecord {
  id: string
  title: string
  category: TweakCategory
  description: string
  rationale: string
  riskLevel: 1 | 2 | 3 | 4
  vipGate: 'free' | 'vip'
  anticheatRisk: 'none' | 'low' | 'medium' | 'high'
  rebootRequired: 'none' | 'logout' | 'reboot' | 'cold-boot'
  actions: TweakAction[]
  /** Optional rig-targeting hints — see TweakTargets. */
  targets?: TweakTargets
  /** Optional per-game applicability. Omitted/empty = applies universally to
   * every supported title. Filtering: a tweak passes the per-game filter iff
   * it's universal OR includes the selected game. */
  applicableGames?: GameId[]
  /** Optional per-game tournament-eligibility verdict. Surfaces a warning pill
   * on the row + powers the "Hide tournament-breaking" filter. */
  tournamentCompliance?: TournamentCompliance
}

export interface Catalog {
  version: string
  generated_at: string
  source: string
  tweaks: TweakRecord[]
}

export const catalog: Catalog = catalogData as unknown as Catalog

export function tweakRequiresAdmin(t: TweakRecord): boolean {
  return t.actions.some((a) => {
    if (a.kind === 'bcdedit_set' || a.kind === 'powershell_script') return true
    if (a.kind === 'registry_set' || a.kind === 'registry_delete')
      return a.hive === 'hklm' || a.hive === 'hkcr'
    if (a.kind === 'file_write') {
      // Mirror Rust-side heuristic: anything outside %USERPROFILE% / %APPDATA%
      // / %LOCALAPPDATA% / %TEMP% needs admin.
      const lower = a.path.toLowerCase()
      const userPaths = ['%userprofile%', '%appdata%', '%localappdata%', '%temp%', '%tmp%']
      if (userPaths.some((p) => lower.startsWith(p))) return false
      return true
    }
    return false
  })
}

interface SpecLike {
  cpu?: { vendor?: string | null }
  gpu?: { vendor?: string | null }
  os?: { build?: number | null }
  ram?: { totalGb?: number | null }
  mobo?: { isLaptop?: boolean | null }
}

/** Returns true if the tweak's `targets` (if any) match the given spec.
 * Tweaks without targets always match. Heuristics intentionally permissive —
 * recommendation surface, not gate. */
export function tweakMatchesSpec(t: TweakRecord, spec: SpecLike | null): boolean {
  if (!t.targets) return true
  if (!spec) return true
  const tg = t.targets

  if (tg.cpuVendor && tg.cpuVendor.length > 0) {
    const v = (spec.cpu?.vendor || '').toLowerCase()
    const matches = tg.cpuVendor.some((want) => v.includes(want))
    if (!matches) return false
  }
  if (tg.gpuVendor && tg.gpuVendor.length > 0) {
    const v = (spec.gpu?.vendor || '').toLowerCase()
    const matches = tg.gpuVendor.some((want) => v.includes(want))
    if (!matches) return false
  }
  if (tg.osMinBuild != null) {
    const b = spec.os?.build ?? 0
    if (b > 0 && b < tg.osMinBuild) return false
  }
  if (tg.osMaxBuild != null) {
    const b = spec.os?.build ?? 0
    if (b > 0 && b > tg.osMaxBuild) return false
  }
  if (tg.ramMinGb != null) {
    const r = spec.ram?.totalGb ?? 0
    if (r > 0 && r < tg.ramMinGb) return false
  }
  if (tg.formFactor && tg.formFactor.length > 0) {
    const isLaptop = spec.mobo?.isLaptop === true
    const want = isLaptop ? 'laptop' : 'desktop'
    if (!tg.formFactor.includes(want)) return false
  }
  return true
}
