import type { SpecProfile } from './tauri'

/**
 * Tune Now is intentionally a policy layer over the catalog. The catalog is
 * the source of individual actions; these profiles decide how much risk and
 * opt-in the automatic planner may consume.
 */
export type TuneIntensity = 'light' | 'competitive' | 'aggressive' | 'extreme'

/**
 * These entries remain visible for an explicit per-tweak decision, but they
 * are never part of an automatic profile. They either weaken security,
 * change a debug/clock policy that Microsoft does not recommend for normal
 * systems, write a static game file without scan-aware interpolation, or
 * cannot be safely proven with the native read-back engine.
 */
const NEVER_AUTO_APPLY_IDS = new Set([
  'process.cpu-mitigations.disable-DANGER',
  'privacy.smartscreen.disable',
  'vbs.hvci.disable',
  'bcd.hypervisorlaunchtype.off',
  'process.hpet.disable',
  'bcd.useplatformclock.disable',
  'bcd.disabledynamictick.yes',
  // This legacy file contains fixed 240 FPS / 1920x1080 values. Keep it
  // explicit until a scan-aware game-config writer can derive safe values
  // from the user's monitor, resolution, and measured frame pacing.
  'fortnite.gus-ini.competitive',
  'fortnite.engine-ini.optimize',
  'apex.videoconfig.optimize',
  'cs2.autoexec.optimize',
])

export interface TuneProfile {
  id: TuneIntensity
  label: string
  summary: string
  maxRisk: 1 | 2 | 3 | 4
  includeExperimental: boolean
  vipRequired: boolean
  requiresConfirmation: boolean
}

const PROFILES: Record<TuneIntensity, TuneProfile> = {
  light: {
    id: 'light',
    label: 'Light',
    summary: 'Low-risk, broadly compatible foundations. Good for a daily PC or first pass.',
    maxRisk: 1,
    includeExperimental: false,
    vipRequired: false,
    requiresConfirmation: false,
  },
  competitive: {
    id: 'competitive',
    label: 'Competitive',
    summary: 'Measured and mechanism-backed Windows/game settings for a dedicated gaming rig.',
    maxRisk: 2,
    includeExperimental: false,
    vipRequired: false,
    requiresConfirmation: false,
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    summary: 'Higher-risk, measurable OS/driver options with an explicit VIP and confirmation gate; no BIOS voltage or thermal writes.',
    maxRisk: 3,
    includeExperimental: true,
    vipRequired: true,
    requiresConfirmation: true,
  },
  extreme: {
    id: 'extreme',
    label: 'Extreme',
    summary: 'Maximum eligible OS/driver/peripheral cleanup for a lab/tournament-prep install; BIOS voltage, thermal limits, security debits, and visual exploits stay outside Tune Now.',
    maxRisk: 4,
    includeExperimental: true,
    vipRequired: true,
    requiresConfirmation: true,
  },
}

export function tuneProfile(id: TuneIntensity): TuneProfile {
  return PROFILES[id]
}

/**
 * Select a conservative starting point from detected hardware. Detection is
 * a starting recommendation, never permission to apply experimental work.
 */
export function recommendedTuneProfile(spec: SpecProfile | null): {
  profile: TuneProfile
  reason: string
} {
  if (!spec) {
    return {
      profile: PROFILES.competitive,
      reason: 'Competitive is the default until the desktop scan identifies your hardware.',
    }
  }
  if (spec.mobo.isLaptop || spec.ram.totalGb < 16) {
    return {
      profile: PROFILES.light,
      reason: spec.mobo.isLaptop
        ? 'Laptop detected: preserve battery life, thermals, and sleep/resume compatibility.'
        : 'Less than 16 GB RAM detected: avoid aggressive memory and service changes.',
    }
  }
  return {
    profile: PROFILES.competitive,
    reason: 'Desktop-class rig with enough memory for the measured competitive baseline.',
  }
}

/**
 * Actions that Tune Now must never apply automatically.
 *
 * A maximum-intensity profile is still an automation policy, not a license to
 * remove security controls or cross a tournament boundary. Risk-4 catalog
 * entries, cosmetic/security degradations, debug-only timer flags, and script
 * actions without a declared read-back contract remain available for
 * inspection and an explicit per-tweak decision on the individual tweak
 * screen. A verified script proves configuration state, not that latency
 * improved; that still requires a before/after measurement.
 */
export function isHardBlockedForAutoTune(t: {
  id?: string
  anticheatRisk: string
  riskLevel?: number
  evidenceTier?: string
  tournamentCompliance?: Partial<Record<string, string>>
  actions?: Array<{ kind?: string; path?: string; verify?: string }>
}): boolean {
  if (t.id && NEVER_AUTO_APPLY_IDS.has(t.id)) return true
  if ((t.riskLevel ?? 0) >= 4) return true
  if (t.evidenceTier === 'cosmetic') return true
  if (t.anticheatRisk === 'high') return true
  if (
    t.actions?.some(
      (action) =>
        (action.kind === 'powershell_script' && !action.verify) ||
        (action.kind === 'file_write' &&
          /(?:GameUserSettings\.ini|Engine\.ini|videoconfig\.txt|autoexec\.cfg)$/i.test(
            action.path ?? '',
          )),
    )
  ) {
    return true
  }
  return Object.values(t.tournamentCompliance ?? {}).some((value) => value === 'breaks')
}
