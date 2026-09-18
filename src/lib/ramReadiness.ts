import type { MoboInfo, RamInfo } from './tauri'
import type { DieResult } from './ramDie'

export type RamReadinessLevel = 'baseline' | 'profile-first' | 'conditional' | 'manual-ready'
export type RamCheckStatus = 'pass' | 'warn' | 'blocked'

export interface RamReadinessCheck {
  label: string
  status: RamCheckStatus
  detail: string
}

export interface RamReadiness {
  level: RamReadinessLevel
  title: string
  summary: string
  nextAction: string
  checks: RamReadinessCheck[]
  notes: string[]
  numericWorksheetEligible: boolean
}

/**
 * Decide whether the app has enough evidence to show a manual memory
 * experiment. This is intentionally not a stability predictor: CPU IMC
 * silicon, board trace layout, BIOS training, temperature, and DIMM layout
 * still decide whether a setting actually works.
 */
export function assessRamTuningReadiness(input: {
  ram: RamInfo
  mobo: MoboInfo
  kitFound: boolean
  ratedSpeedMts: number | null
  dies: DieResult[]
}): RamReadiness {
  const { ram, mobo, kitFound, ratedSpeedMts, dies } = input
  const modules = input.ram.modules ?? []
  const running = ram.configuredSpeedMts ?? ram.speedMts ?? 0
  const uniqueParts = new Set(
    modules
      .map((module) => module.partNumber?.trim().toUpperCase())
      .filter((part): part is string => Boolean(part)),
  )
  const mixedPartNumbers = uniqueParts.size > 1
  const boardKnown = Boolean(mobo.product && mobo.biosVersion)
  const dieSignal = dies.filter((die) => Boolean(die.die))
  const dieConsistent = dieSignal.length > 0 && new Set(dieSignal.map((die) => die.die)).size === 1
  const sameLayout = !modules.length || modules.every((module) => {
    const part = module.partNumber?.trim().toUpperCase()
    return !part || part === [...uniqueParts][0]
  })
  const twoDimmLayout = ram.stickCount > 0 && ram.stickCount <= 2
  const belowRated = Boolean(
    ratedSpeedMts && running > 0 && running < ratedSpeedMts - 400,
  )
  const laptop = mobo.isLaptop
  const numericWorksheetEligible =
    !laptop && kitFound && boardKnown && dieConsistent && sameLayout && twoDimmLayout && !belowRated

  const checks: RamReadinessCheck[] = [
    {
      label: 'CPU vs memory diagnosis',
      status: belowRated ? 'warn' : 'pass',
      detail: belowRated
        ? `Memory is running at ${running || 'an unknown'} MT/s while the catalog profile is ${ratedSpeedMts} MT/s. Establish the rated XMP/EXPO baseline before touching CPU settings.`
        : 'No obvious under-profiled memory state was detected. A CPU tweak is not assumed to be the answer.',
    },
    {
      label: 'Kit identity',
      status: kitFound ? 'pass' : 'blocked',
      detail: kitFound
        ? 'The part number matched a manufacturer-rated reference in the local catalog.'
        : 'No local kit match. Keep the vendor profile and do not infer a numeric timing target from DDR speed alone.',
    },
    {
      label: 'Board + BIOS context',
      status: boardKnown ? 'pass' : 'blocked',
      detail: boardKnown
        ? `${mobo.product} · BIOS ${mobo.biosVersion}`
        : 'Board model or BIOS version is missing; tuning behavior cannot be mapped to the board training implementation.',
    },
    {
      label: 'SPD die signal',
      status: dieConsistent ? 'pass' : dies.length ? 'warn' : 'blocked',
      detail: dieConsistent
        ? `SPD reports a consistent ${dieSignal[0].die} family signal. This is a candidate, not proof of headroom.`
        : dies.length
        ? 'SPD returned data, but the DIMMs do not produce one consistent die signal. Hide numeric recipes until the modules are identified.'
        : 'Read SPD to improve the die signal. SPD still cannot prove stability by itself.',
    },
    {
      label: 'DIMM layout',
      status: mixedPartNumbers || !sameLayout || !twoDimmLayout ? 'warn' : 'pass',
      detail: mixedPartNumbers || !sameLayout
        ? 'Different module part numbers were detected. Mixed kits commonly need looser training and invalidate copy-paste recipes.'
        : !twoDimmLayout
        ? `${ram.stickCount} DIMMs detected. Four-DIMM and high-capacity layouts can reduce memory-controller margin.`
        : 'One or two DIMMs with a consistent part-number signal; board topology still matters.',
    },
  ]

  if (laptop) {
    return {
      level: 'baseline',
      title: 'Laptop / firmware-limited memory path',
      summary: 'The app can audit the running profile, but automatic memory tuning is not appropriate when the board firmware owns the limits.',
      nextAction: 'Keep the vendor profile, validate frametime, and use Windows/driver controls instead of BIOS timing experiments.',
      checks,
      notes: [
        'Do not equate a higher headline MT/s number with lower Fortnite latency.',
        'Any manual firmware option must come from the laptop vendor and exact BIOS version.',
      ],
      numericWorksheetEligible: false,
    }
  }

  if (belowRated) {
    return {
      level: 'profile-first',
      title: 'Memory profile first — do not chase the CPU yet',
      summary: 'The scan points to a memory-profile mismatch before it points to CPU headroom. Start with the exact manufacturer XMP/EXPO profile and test it.',
      nextAction: 'Save the current BIOS profile, enable only the rated XMP/EXPO profile, then cold-boot and run memory + Fortnite validation.',
      checks,
      notes: [
        'The CPU memory controller may be the limit after the rated profile is enabled; that is a separate test from CPU core overclocking.',
        'If the rated profile fails, return to the last known-good profile rather than raising voltage blindly.',
      ],
      numericWorksheetEligible: false,
    }
  }

  if (numericWorksheetEligible) {
    return {
      level: 'manual-ready',
      title: 'Manual lab eligible — headroom still has to be proven',
      summary: 'The app has enough kit, board, BIOS, SPD, and layout context to show a candidate worksheet. It still cannot know whether this CPU/IMC and DIMM pair will hold a tighter value.',
      nextAction: 'Change one secondary timing at a time, cold-boot, run memory validation, check WHEA, then compare the same Fortnite route.',
      checks,
      notes: [
        'The CPU may not need tuning at all; stable RAM timings and frametime consistency can be the higher-value lever.',
        'A failed training cycle, WHEA, crash, shader error, or worse 1% low is a failed experiment even if average FPS rises.',
      ],
      numericWorksheetEligible: true,
    }
  }

  return {
    level: 'conditional',
    title: 'Conditional manual path — collect more evidence first',
    summary: 'The app can show the installed baseline, but the current evidence is not strong enough to treat a timing recipe as rig-specific.',
    nextAction: 'Confirm the exact kit and BIOS, read every DIMM over SPD, and keep the vendor profile as the known-good reference.',
    checks,
    notes: [
      'Not every kit, DIMM layout, or CPU memory controller has useful overclocking headroom.',
      'Unknown or mixed memory should never be “optimized” by guessing a community timing table.',
    ],
    numericWorksheetEligible: false,
  }
}
