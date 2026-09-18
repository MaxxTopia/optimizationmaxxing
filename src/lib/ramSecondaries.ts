/**
 * Manual RAM tuning worksheet.
 *
 * This module intentionally contains BIOS-facing timing and voltage guidance
 * as articleware only. It is never converted into a native action and never
 * appears in Tune Now's apply batch. The user must enter each value in the
 * motherboard UI, keep a known-good profile, and validate the result.
 */

export interface TimingRow {
  timing: string
  value: string
  note?: string
}

export interface VoltageRow {
  rail: string
  baseline: string
  experiment: string
  stop: string
}

export interface SecondarySuggestion {
  ddr: 'DDR4' | 'DDR5'
  dieLabel: string
  /** False when the die is unknown/unsupported; no specific timing is shown. */
  known: boolean
  speedMts: number
  trfc: { clocks: number; ns: number; tightenToward: string } | null
  rows: TimingRow[]
  voltageRows: VoltageRow[]
  platformNote: string
  caveats: string[]
  guide: { label: string; url: string }
}

const DDR4_TFRC_NS: Array<{ re: RegExp; die: string; ns: number }> = [
  { re: /micron.*rev.?\s?e|micron.*e-?die|\bm8e\b/i, die: 'Micron Rev.E', ns: 311 },
  { re: /micron.*rev.?\s?b|\bm16b\b/i, die: 'Micron Rev.B', ns: 311 },
  { re: /\bcjr\b|hynix.*cjr/i, die: 'Hynix CJR', ns: 292 },
  { re: /\bdjr\b|hynix.*djr/i, die: 'Hynix DJR', ns: 280 },
  { re: /\bmjr\b|hynix.*(mjr|afr|a-?die|c-?die)/i, die: 'Hynix MJR/AFR', ns: 280 },
  { re: /samsung.*b-?die|\bb-?die\b|\bs8b\b/i, die: 'Samsung B-die', ns: 170 },
  { re: /nanya/i, die: 'Nanya', ns: 160 },
]

const DDR5_TFRC_NS: Array<{ re: RegExp; die: string; ns: number }> = [
  { re: /hynix.*a-?die|\ba-?die\b/i, die: 'SK Hynix A-die', ns: 160 },
  { re: /hynix.*m-?die|\bm-?die\b/i, die: 'SK Hynix M-die', ns: 170 },
]

const DDR5_SECONDARIES = (speed: number): TimingRow[] => {
  const scaled = speed >= 6300
  return [
    { timing: 'tRAS', value: scaled ? '34' : '32' },
    { timing: 'tRC', value: scaled ? '72' : '68', note: 'raise until it boots if needed (tRAS + tRP)' },
    { timing: 'tRTP', value: '12', note: 'floor — do not go below 12 on DDR5' },
    { timing: 'tWR', value: '48', note: 'keep a multiple of 6' },
    { timing: 'tRRD_S / tRRD_L', value: '4 / 8' },
    { timing: 'tFAW', value: '20', note: 'low payoff — leave loose' },
    { timing: 'tWTR_S / tWTR_L', value: '6 / 16' },
    { timing: 'CL / tRCD / tRP', value: 'leave at XMP/EXPO', note: 'primaries are riskier — do not hand-tune here' },
  ]
}

const DDR4_SECONDARIES: TimingRow[] = [
  { timing: 'tRRD_S / tRRD_L', value: '6 / 6' },
  { timing: 'tFAW', value: '24', note: 'no gain below tRRD_S × 4' },
  { timing: 'tWR', value: '20' },
  { timing: 'tRTP', value: '10', note: 'keep tRAS ≥ tRCD + tRTP' },
  { timing: 'tWTR_S / tWTR_L', value: '4 / 12' },
  { timing: 'Gear Down Mode', value: 'Enabled', note: 'safe default — keeps Command Rate 1T easy' },
  { timing: 'Command Rate', value: '1T (with GDM on)' },
  { timing: 'CL / tRCD / tRP / tRAS', value: 'honor your XMP rating', note: 'primaries follow the kit — do not hand-tune here' },
]

function findDie(dieInferred: string, table: Array<{ re: RegExp; die: string; ns: number }>) {
  return table.find((entry) => entry.re.test(dieInferred)) ?? null
}

function voltageWorksheet(ratedVoltage: number | null | undefined, ddr: 'DDR4' | 'DDR5'): VoltageRow[] {
  const rated = ratedVoltage && ratedVoltage > 0
    ? ratedVoltage.toFixed(2) + ' V manufacturer profile'
    : 'read the exact XMP/EXPO profile'
  return [
    {
      rail: ddr === 'DDR5' ? 'DRAM VDD / VDDQ' : 'DRAM voltage',
      baseline: rated,
      experiment: 'Manual only: if the exact kit + board guide permits it, change one small step at a time and record the value.',
      stop: 'Stop at the kit/board manufacturer limit. There is no universal safe ceiling in this app.',
    },
    {
      rail: ddr === 'DDR5' ? 'CPU VDDQ / IMC rail' : 'VCCSA / IMC rail',
      baseline: 'Auto / Intel Default Settings or AMD Auto',
      experiment: 'No generic target. Tune only from an exact CPU, board, BIOS, and memory-controller guide.',
      stop: 'Any WHEA, training loop, data error, crash, or temperature regression means revert.',
    },
    {
      rail: ddr === 'DDR5' ? 'PMIC / VPP' : 'SoC / VDDIO',
      baseline: 'Auto / board default',
      experiment: 'Do not copy a community number across platforms; leave automatic unless the platform guide is exact.',
      stop: 'Never use voltage to conceal instability. Return to the last known-good profile.',
    },
  ]
}

const TEST_CAVEATS = [
  'This is a manual starting worksheet, not a guaranteed-stable profile. It is only a win after it passes testing and improves the same-game frametime route.',
  'Change one setting at a time. Keep the previous BIOS profile and a CMOS/recovery path before entering the BIOS.',
  'Run a current memory test, then a warm Fortnite session. Watch WHEA-Logger, crashes, anti-cheat failures, shader errors, and frametime spikes.',
  'Voltage rows are intentionally bounded by the exact kit and board documentation. The app does not invent a universal voltage ceiling and never writes voltage.',
  'Dual-rank or four-DIMM layouts can need looser values than this worksheet. Unknown die means unknown timing targets.',
]

/**
 * Return a die-gated manual worksheet. Unknown dies deliberately return no
 * numeric timing targets, but still return the voltage audit table so the user
 * can see the exact rails that must remain board-specific.
 */
export function suggestSecondaries(
  dieInferred: string | null | undefined,
  speedMts: number,
  ratedVoltage?: number | null,
): SecondarySuggestion {
  const speed = speedMts > 0 ? speedMts : 0
  const isDdr5 = speed >= 4800
  const ddr: 'DDR4' | 'DDR5' = isDdr5 ? 'DDR5' : 'DDR4'
  const die = dieInferred ?? ''
  const guide = isDdr5
    ? { label: "buildzoid's Hynix DDR5 low-effort guide", url: 'https://www.youtube.com/results?search_query=buildzoid+hynix+ddr5+low+effort+timings' }
    : { label: 'Ryzen DRAM Calculator (reference only)', url: 'https://www.techpowerup.com/download/ryzen-dram-calculator/' }

  const platformNote = isDdr5
    ? 'On AMD, validate whether UCLK=MCLK remains stable at the chosen speed; on Intel, validate the board training result. The ratio and game frametime matter more than the headline MT/s number.'
    : 'On AMD, compare the fabric ratio and frametime rather than chasing frequency. On Intel, validate the board training result and gear mode after every change.'

  const match = findDie(die, isDdr5 ? DDR5_TFRC_NS : DDR4_TFRC_NS)
  if (!match) {
    return {
      ddr,
      dieLabel: die || 'unidentified',
      known: false,
      speedMts: speed,
      trfc: null,
      rows: [],
      voltageRows: voltageWorksheet(ratedVoltage, ddr),
      platformNote,
      caveats: [
        'No numeric timing table is shown until the DRAM die is confirmed. tRFC is die-specific; guessing is how an apparently fast profile becomes unstable.',
        'Use the kit manufacturer profile as the baseline and retain the board recovery profile before opening a manual experiment.',
        ...TEST_CAVEATS,
      ],
      guide,
    }
  }

  const clocks = Math.round((match.ns * speed) / 2000)
  return {
    ddr,
    dieLabel: match.die,
    known: true,
    speedMts: speed,
    trfc: {
      clocks,
      ns: match.ns,
      tightenToward: isDdr5
        ? (match.die.includes('A-die')
          ? 'try ~' + Math.round((120 * speed) / 2000) + ' clocks (~120 ns) only if it stays stable and cool'
          : 'try ~' + Math.round((150 * speed) / 2000) + ' clocks (~150 ns) cautiously')
        : 'the reference fast preset may go tighter for ' + match.die + '; use one step + one test at a time',
    },
    rows: isDdr5 ? DDR5_SECONDARIES(speed) : DDR4_SECONDARIES,
    voltageRows: voltageWorksheet(ratedVoltage, ddr),
    platformNote,
    caveats: TEST_CAVEATS,
    guide,
  }
}
