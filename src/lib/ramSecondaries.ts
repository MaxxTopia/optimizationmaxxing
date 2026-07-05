/**
 * Secondary RAM timing suggestions — the biggest latency win after XMP/EXPO,
 * and the part most kits leave loose. This is READ-ONLY guidance: the app
 * suggests a conservative SAFE STARTING POINT keyed to the detected die + speed,
 * the user types it into BIOS and stability-tests it. The app never writes SPD.
 *
 * Hard rules baked in from the research (buildzoid / integralfx DDR4 OC guide /
 * Ryzen DRAM Calculator / Hynix DDR5 guides):
 *  - tRFC is the #1 secondary and is DIE-GATED — never apply Hynix numbers to
 *    Samsung/Micron. If we can't identify the die, we refuse to suggest and tell
 *    the user to confirm it first.
 *  - We NEVER suggest voltages or ProcODT/RTT/CAD/VCCSA/VSOC — those are what
 *    kill IMCs. Voltage stays at XMP/EXPO.
 *  - Every value is a conservative starting point (safe > fast), explicitly not
 *    guaranteed stable, gated behind mandatory stability testing.
 *  - tRFC is temperature-sensitive: the safe values carry headroom, test warm.
 */

export interface TimingRow {
  timing: string
  value: string
  note?: string
}

export interface SecondarySuggestion {
  ddr: 'DDR4' | 'DDR5'
  dieLabel: string
  /** False when the die is unknown/unsupported — we then refuse specific values. */
  known: boolean
  speedMts: number
  /** The headline timing. clocks is what you enter in BIOS. */
  trfc: { clocks: number; ns: number; tightenToward: string } | null
  rows: TimingRow[]
  platformNote: string
  caveats: string[]
  guide: { label: string; url: string }
}

const DDR4_TFRC_NS: Array<{ re: RegExp; die: string; ns: number }> = [
  { re: /micron.*rev\.?\s?e|micron.*e-?die|\bm8e\b/i, die: 'Micron Rev.E', ns: 311 },
  { re: /micron.*rev\.?\s?b|\bm16b\b/i, die: 'Micron Rev.B', ns: 311 },
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
  const scaled = speed >= 6300 // 6400-class vs 6000-class
  return [
    { timing: 'tRAS', value: scaled ? '34' : '32' },
    { timing: 'tRC', value: scaled ? '72' : '68', note: 'raise until it boots if needed (tRAS + tRP)' },
    { timing: 'tRTP', value: '12', note: 'floor — do NOT go below 12 on DDR5' },
    { timing: 'tWR', value: '48', note: 'keep a multiple of 6' },
    { timing: 'tRRD_S / tRRD_L', value: '4 / 8' },
    { timing: 'tFAW', value: '20', note: 'low payoff — leave loose' },
    { timing: 'tWTR_S / tWTR_L', value: '6 / 16' },
    { timing: 'CL / tRCD / tRP', value: 'leave at XMP/EXPO', note: 'primaries are riskier — do not hand-tune here' },
  ]
}

const DDR4_SECONDARIES: TimingRow[] = [
  { timing: 'tRRD_S / tRRD_L', value: '6 / 6' },
  { timing: 'tFAW', value: '24', note: 'no gain below tRRD_S×4' },
  { timing: 'tWR', value: '20' },
  { timing: 'tRTP', value: '10', note: 'keep tRAS ≥ tRCD + tRTP' },
  { timing: 'tWTR_S / tWTR_L', value: '4 / 12' },
  { timing: 'Gear Down Mode', value: 'Enabled', note: 'safe default — keeps Command Rate 1T easy' },
  { timing: 'Command Rate', value: '1T (with GDM on)' },
  { timing: 'CL / tRCD / tRP / tRAS', value: 'honor your XMP rating', note: 'primaries follow the kit — do not hand-tune here' },
]

function findDie(dieInferred: string, table: Array<{ re: RegExp; die: string; ns: number }>) {
  return table.find((e) => e.re.test(dieInferred)) ?? null
}

const TEST_CAVEATS = [
  'This is a conservative STARTING POINT, not a guaranteed-stable setting — your exact silicon may do better or need looser. It is only "applied" once it PASSES testing.',
  'Mandatory before you trust it: TestMem5 with the anta777 Extreme config (3+ cycles), then y-cruncher or Karhu / OCCT. A single error, freeze, or BSOD means REVERT the last change and retest — unstable RAM silently corrupts data.',
  'tRFC is temperature-sensitive: a value that passes in a cool room can error under a hot summer gaming load. Test warm, and keep the headroom above.',
  'We never touch or suggest voltages (VDDQ / VCCSA / VSOC / ProcODT / RTT / CAD). Leave XMP/EXPO voltage as-is — raising those is what permanently damages memory controllers. For those, use Ryzen DRAM Calculator with your exact die + board.',
  'Suggestions assume single-rank 2-stick kits. Dual-rank (many 2×32 GB or 32 GB sticks) stresses the controller harder — loosen tRFC + turnarounds beyond these.',
]

export function suggestSecondaries(
  dieInferred: string | null | undefined,
  speedMts: number,
): SecondarySuggestion {
  const speed = speedMts > 0 ? speedMts : 0
  const isDdr5 = speed >= 4800
  const ddr: 'DDR4' | 'DDR5' = isDdr5 ? 'DDR5' : 'DDR4'
  const die = dieInferred ?? ''
  const guide = isDdr5
    ? { label: "buildzoid's Hynix DDR5 low-effort guide", url: 'https://www.youtube.com/results?search_query=buildzoid+hynix+ddr5+low+effort+timings' }
    : { label: 'Ryzen DRAM Calculator (Safe preset)', url: 'https://www.techpowerup.com/download/ryzen-dram-calculator/' }

  const platformNote = isDdr5
    ? 'Secondary timings are the same on Intel and AMD. On AMD, keep DDR5-6000 at 1:1 (UCLK=MCLK) — going higher usually drops to 1:2 and adds latency. On Intel this runs in Gear 2 by default; that\'s normal, leave it.'
    : 'On AMD, the sweet spot is DDR4-3600 with FCLK 1800 (1:1) — going faster breaks 1:1 and erases the gain. Tighten timings instead of chasing MHz.'

  const match = findDie(die, isDdr5 ? DDR5_TFRC_NS : DDR4_TFRC_NS)

  if (!match) {
    // Unknown / unsupported die (incl. Samsung/Micron DDR5) — refuse specifics.
    return {
      ddr,
      dieLabel: die || 'unidentified',
      known: false,
      speedMts: speed,
      trfc: null,
      rows: [],
      platformNote,
      caveats: [
        'We can only suggest safe secondaries once your die is confirmed — tRFC especially is die-specific and applying the wrong die\'s value corrupts data.',
        isDdr5
          ? 'Samsung/Micron DDR5 need much looser tRFC than Hynix — keep your XMP/EXPO profile and verify your die first.'
          : 'Confirm your die (Thaiphoon Burner / the Die Finder link), then re-scan and we\'ll suggest targets.',
      ],
      guide,
    }
  }

  const clocks = Math.round((match.ns * speed) / 2000)
  const trfc = {
    clocks,
    ns: match.ns,
    tightenToward: isDdr5
      ? (match.die.includes('A-die')
          ? `try ~${Math.round((120 * speed) / 2000)} (~120 ns) if it stays stable and cool`
          : `try ~${Math.round((150 * speed) / 2000)} (~150 ns) cautiously`)
      : `DRAM Calculator "Fast" preset goes tighter for ${match.die} — only with airflow + testing`,
  }

  return {
    ddr,
    dieLabel: match.die,
    known: true,
    speedMts: speed,
    trfc,
    rows: isDdr5 ? DDR5_SECONDARIES(speed) : DDR4_SECONDARIES,
    platformNote,
    caveats: TEST_CAVEATS,
    guide,
  }
}
