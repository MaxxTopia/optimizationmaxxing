import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  biosAuditProbe,
  inTauri,
  type BiosAudit,
} from '../lib/tauri'

/**
 * BiosAuditCard — read what Windows can see about BIOS settings + compare
 * against the per-game ideal config. Pass/warn/fail/unknown punchlist with
 * one-line "what to flip in BIOS" guidance per failure.
 *
 * Detects the motherboard vendor + product + BIOS firmware version, then
 * surfaces the per-vendor BIOS UI navigation paths so the user knows
 * exactly which menu to hit on THEIR board for each setting. Vendors
 * organize their BIOS menus differently (ASUS: Ai Tweaker / Advanced /
 * Boot, MSI: OC / Settings, Gigabyte: Tweaker / Settings, ASRock: OC
 * Tweaker / Advanced), so vague "go to BIOS → memory section" guidance
 * is less helpful than "ASUS Ai Tweaker → DOCP."
 *
 * For the BIOS values Windows can't read (PBO offsets, Curve Optimizer
 * per-core values, EXPO timing tables, SVID Behavior), the card flags
 * which of those each board's UI does/doesn't expose and points to
 * the SCEWIN dump-and-diff workflow in /guides for the rest.
 */

/** Vendor-specific BIOS UI map. Keyed by lowercased manufacturer substring
 *  match against `Win32_BaseBoard.Manufacturer` (ASUS reports
 *  "ASUSTeK COMPUTER INC.", MSI reports "MSI" or "Micro-Star International",
 *  Gigabyte reports "Gigabyte Technology Co., Ltd.", ASRock reports
 *  "ASRock"). */
interface BiosUiMap {
  vendor: string
  advancedHotkey: string
  /** Where each user-relevant setting lives in the BIOS UI menu tree. */
  paths: {
    secureBoot: string
    tpm: string
    csm: string
    expoXmp: string
    smt: string
    /** PBO / Curve Optimizer — null = vendor hides it / doesn't expose. */
    pboCurveOptimizer: string | null
    /** Resizable BAR — null = hidden / only auto-on. */
    rebar: string | null
  }
  /** Settings this vendor's BIOS UI lets you tune. */
  exposedInUi: string[]
  /** Settings only visible via SCEWIN dump on this vendor (BIOS UI hides them). */
  needsScewin: string[]
}

const BIOS_UI_MAPS: BiosUiMap[] = [
  {
    vendor: 'ASUS',
    advancedHotkey: 'F7 to toggle Advanced Mode (boots into EZ Mode by default)',
    paths: {
      secureBoot: 'Boot → Secure Boot → OS Type: "Other OS" → Key Management → Install Default Secure Boot Keys',
      tpm: 'Advanced → PCH-FW Configuration → PTT (Intel) — or Advanced → AMD fTPM Configuration → AMD CPU fTPM (AMD)',
      csm: 'Boot → CSM (Compatibility Support Module) → Launch CSM → Disabled',
      expoXmp: 'Ai Tweaker → Ai Overclock Tuner → "D.O.C.P. Standard" (AMD) or "XMP" (Intel)',
      smt: 'Advanced → CPU Configuration → SVM Mode + SMT Mode (AMD) / Hyper-Threading Technology (Intel)',
      pboCurveOptimizer:
        'Ai Tweaker → Precision Boost Overdrive → PBO Curve Optimizer (AMD only). Per-core CO offsets live here on X670E/X870E boards.',
      rebar: 'Advanced → PCI Subsystem Settings → Above 4G Decoding → Enabled, then Re-Size BAR Support → Enabled',
    },
    exposedInUi: [
      'PBO + per-core Curve Optimizer offsets (X670E / X870E boards)',
      'EXPO/DOCP profile selection + memory frequency + voltage',
      'CPU + SOC voltage (most boards)',
      'Fan curves via Q-Fan',
    ],
    needsScewin: [
      'Per-DRAM-channel secondary/tertiary timings (some boards only)',
      'Hidden CBS settings on older AGESA versions',
      'OEM-locked microcode hash overrides',
    ],
  },
  {
    vendor: 'MSI',
    advancedHotkey: 'F7 to toggle Advanced Mode',
    paths: {
      secureBoot: 'Settings → Security → Secure Boot → Enabled → Reset to Default Keys',
      tpm: 'Settings → Security → Trusted Computing → AMD CPU fTPM (AMD) or Settings → Security → Intel Platform Trust Technology (Intel)',
      csm: 'Settings → Advanced → Windows OS Configuration → BIOS CSM/UEFI Mode → UEFI',
      expoXmp: 'OC → Extreme Memory Profile (EXPO/XMP)',
      smt: 'OC → Advanced CPU Configuration → SMT Control (AMD) or Hyper-Threading (Intel)',
      pboCurveOptimizer:
        'OC → Advanced CPU Configuration → AMD Overclocking → Precision Boost Overdrive (AMD). MSI buries this several levels deep.',
      rebar: 'Settings → Advanced → PCI Subsystem Settings → Re-Size BAR Support → Auto',
    },
    exposedInUi: [
      'EXPO/XMP + primary memory timings',
      'PBO + Curve Optimizer (buried under OC → Advanced)',
      'CPU LITE Load (Intel auto-undervolt presets)',
      'Memory Try It! preset library',
    ],
    needsScewin: [
      'Secondary memory timings on B650 chipset (X670+ exposes them)',
      'PCIe AER + ASPM granular controls',
      'Locked SVID Behavior on cheaper boards (PRO B650M / B650-A)',
    ],
  },
  {
    vendor: 'Gigabyte',
    advancedHotkey: 'F2 to toggle Advanced Mode (Easy Mode default)',
    paths: {
      secureBoot: 'Boot → Secure Boot → Secure Boot Enable + restore factory keys',
      tpm: 'Settings → AMD CBS → AMD fTPM Configuration (AMD) or Settings → Miscellaneous → Trusted Computing (Intel)',
      csm: 'Boot → CSM Support → Disabled',
      expoXmp: 'Tweaker → Extreme Memory Profile (X.M.P.) — Gigabyte still calls EXPO "X.M.P. AMD" on some BIOS revs',
      smt: 'Settings → AMD CBS → CPU Common Options → SMT Control (AMD) or Tweaker → Advanced CPU Settings → Hyper-Threading (Intel)',
      pboCurveOptimizer:
        'Tweaker → Advanced CPU Settings → Precision Boost Overdrive (AMD). On AORUS Master / Elite the CO per-core menu is on a separate page deeper down.',
      rebar: 'Settings → IO Ports → Resizable BAR Support → Enabled (requires Above 4G Decoding ON first)',
    },
    exposedInUi: [
      'EXPO/XMP profile selection',
      'PBO + Curve Optimizer (AORUS Master / Elite boards)',
      'Above 4G Decoding + Resizable BAR',
      'Per-fan curve via Smart Fan',
    ],
    needsScewin: [
      'Memory secondary timings on B650 + cheaper X670 boards',
      'Per-rail VRM phase counts + LLC tables',
      'AGESA CBS items not exposed in the Settings → AMD CBS tree',
    ],
  },
  {
    vendor: 'ASRock',
    advancedHotkey: 'F6 to toggle Advanced Mode',
    paths: {
      secureBoot: 'Security → Secure Boot → Secure Boot Mode: Standard / Custom → Install default keys',
      tpm: 'Security → Trusted Computing → AMD fTPM switch (AMD) or Security → Intel Platform Trust Technology (Intel)',
      csm: 'Boot → CSM (Compatibility Support Module) → CSM → Disabled',
      expoXmp: 'OC Tweaker → DRAM Frequency → AMD EXPO Profile 1 / XMP Profile 1',
      smt: 'Advanced → CPU Configuration → SMT Mode (AMD) / Hyper-Threading (Intel)',
      pboCurveOptimizer:
        'OC Tweaker → AMD Overclocking → Precision Boost Overdrive → Curve Optimizer. ASRock exposes per-core CO on most X670/X870 boards.',
      rebar: 'Advanced → PCI Configuration → Above 4G Decoding + Re-Size BAR Support',
    },
    exposedInUi: [
      'EXPO/XMP + primary + most secondary timings (ASRock exposes more than MSI/Gigabyte on B650)',
      'PBO + Curve Optimizer per-core',
      'A-Tuning / BFB (Base Frequency Boost) for non-K Intel chips',
    ],
    needsScewin: [
      'Some tertiary memory timings on Lightning / Pro chipset SKUs',
      'CBS AGESA leaf items not exposed in OC Tweaker',
    ],
  },
]

function findBiosMap(manufacturer: string | null): BiosUiMap | null {
  if (!manufacturer) return null
  const m = manufacturer.toLowerCase()
  // Substring match. Manufacturer strings vary:
  //   ASUS: "ASUSTeK COMPUTER INC."
  //   MSI: "MSI" / "Micro-Star International Co., Ltd."
  //   Gigabyte: "Gigabyte Technology Co., Ltd."
  //   ASRock: "ASRock"
  if (m.includes('asus')) return BIOS_UI_MAPS.find((b) => b.vendor === 'ASUS') ?? null
  if (m.includes('msi') || m.includes('micro-star')) {
    return BIOS_UI_MAPS.find((b) => b.vendor === 'MSI') ?? null
  }
  if (m.includes('gigabyte') || m.includes('aorus')) {
    return BIOS_UI_MAPS.find((b) => b.vendor === 'Gigabyte') ?? null
  }
  if (m.includes('asrock')) return BIOS_UI_MAPS.find((b) => b.vendor === 'ASRock') ?? null
  return null
}

/** Format the BIOS release date from yyyymmdd to a more readable form. */
function fmtBiosDate(raw: string | null): string | null {
  if (!raw || raw.length < 8) return null
  const y = raw.slice(0, 4)
  const m = raw.slice(4, 6)
  const d = raw.slice(6, 8)
  return `${y}-${m}-${d}`
}

type GameId = 'fortnite' | 'valorant' | 'cs2'

interface GameProfile {
  id: GameId
  label: string
  blurb: string
  /** Each ideal is a function over the live audit returning verdict + detail. */
  ideal: {
    biosMode: 'UEFI'
    secureBoot: 'required' | 'preferred' | 'optional'
    tpm: 'required' | 'preferred' | 'optional'
    smt: 'on'
    expoXmp: 'on'
    powerPlan: 'High performance' | 'Ultimate Performance'
  }
}

const GAME_PROFILES: GameProfile[] = [
  {
    id: 'fortnite',
    label: 'Fortnite',
    blurb:
      'FNCS rigs need Secure Boot + TPM 2.0 (Easy Anti-Cheat eligibility). VBS off for perf — Fortnite is allowed.',
    ideal: {
      biosMode: 'UEFI',
      secureBoot: 'required',
      tpm: 'required',
      smt: 'on',
      expoXmp: 'on',
      powerPlan: 'High performance',
    },
  },
  {
    id: 'valorant',
    label: 'Valorant',
    blurb:
      'Vanguard requires Secure Boot + TPM 2.0 hard. VBS can be off (Vanguard doesn\'t require Memory Integrity on as of 2026-05).',
    ideal: {
      biosMode: 'UEFI',
      secureBoot: 'required',
      tpm: 'required',
      smt: 'on',
      expoXmp: 'on',
      powerPlan: 'High performance',
    },
  },
  {
    id: 'cs2',
    label: 'CS2',
    blurb:
      'VAC alone doesn\'t care about Secure Boot / TPM, but FACEIT + ESEA do. EXPO/XMP + SMT on for the fps.',
    ideal: {
      biosMode: 'UEFI',
      secureBoot: 'preferred',
      tpm: 'preferred',
      smt: 'on',
      expoXmp: 'on',
      powerPlan: 'High performance',
    },
  },
]

type Verdict = 'pass' | 'warn' | 'fail' | 'unknown'

interface Check {
  label: string
  verdict: Verdict
  detail: string
  fix?: string
}

function buildChecks(a: BiosAudit, profile: GameProfile, ui: BiosUiMap | null): Check[] {
  const checks: Check[] = []
  // Compose a "→ on your <board>: <menu path>" suffix when we have a vendor
  // map. Keeps the generic guidance intact for unrecognized boards.
  const path = (key: keyof BiosUiMap['paths']): string => {
    const p = ui?.paths[key]
    return p ? ` On your ${ui!.vendor} board: ${p}.` : ''
  }

  // BIOS mode (UEFI vs Legacy) — Legacy = CSM is on.
  if (a.biosMode == null) {
    checks.push({
      label: 'UEFI boot (CSM off)',
      verdict: 'unknown',
      detail: 'Could not read BIOS firmware type.',
    })
  } else if (a.biosMode.toLowerCase() === 'uefi') {
    checks.push({
      label: 'UEFI boot (CSM off)',
      verdict: 'pass',
      detail: 'BIOS is UEFI mode — CSM disabled.',
    })
  } else {
    checks.push({
      label: 'UEFI boot (CSM off)',
      verdict: 'fail',
      detail: `BIOS is in ${a.biosMode} mode. CSM / Legacy boot is on.`,
      fix:
        `CSM ON disables Resizable BAR and adds ~2s to boot. Disable it.${path('csm')} (Heads-up: switching off CSM may require reinstalling Windows on UEFI/GPT if the current install is BIOS/MBR.)`,
    })
  }

  // Secure Boot
  if (a.secureBoot == null) {
    checks.push({
      label: 'Secure Boot',
      verdict: 'unknown',
      detail: 'Could not read Secure Boot state (typically needs UEFI mode to query).',
    })
  } else {
    const need = profile.ideal.secureBoot
    if (a.secureBoot) {
      checks.push({
        label: 'Secure Boot',
        verdict: 'pass',
        detail: 'Enabled.',
      })
    } else {
      checks.push({
        label: 'Secure Boot',
        verdict: need === 'required' ? 'fail' : 'warn',
        detail: 'Disabled.',
        fix:
          need === 'required'
            ? `${profile.label} requires Secure Boot for anti-cheat eligibility.${path('secureBoot')}`
            : `Optional for this title, but enable it if you also play FACEIT/Vanguard/FNCS.${path('secureBoot')}`,
      })
    }
  }

  // TPM
  if (a.tpmEnabled == null) {
    checks.push({
      label: 'TPM 2.0',
      verdict: 'unknown',
      detail: 'Could not query TPM (Get-Tpm failed — needs admin on some boards).',
    })
  } else {
    const need = profile.ideal.tpm
    if (a.tpmEnabled) {
      checks.push({
        label: 'TPM 2.0',
        verdict: 'pass',
        detail: 'Ready + enabled.',
      })
    } else {
      checks.push({
        label: 'TPM 2.0',
        verdict: need === 'required' ? 'fail' : 'warn',
        detail: 'Not ready / disabled.',
        fix:
          need === 'required'
            ? `${profile.label} requires TPM 2.0.${path('tpm')} Then in Windows run "tpm.msc" to verify it shows Ready.`
            : `Optional for this title — enable if you also play Valorant or FNCS.${path('tpm')}`,
      })
    }
  }

  // SMT / HT
  if (a.smtEnabled == null) {
    checks.push({
      label: 'SMT / Hyper-Threading',
      verdict: 'unknown',
      detail: 'Could not derive logical-vs-physical core count.',
    })
  } else if (a.smtEnabled) {
    checks.push({
      label: 'SMT / Hyper-Threading',
      verdict: 'pass',
      detail: 'Enabled — logical cores > physical cores.',
    })
  } else {
    checks.push({
      label: 'SMT / Hyper-Threading',
      verdict: 'warn',
      detail: 'Disabled — logical cores = physical cores.',
      fix:
        `SMT off is a CS:GO/Overwatch-1-era esports trick that doesn't apply to UE5 games. Turn it back ON.${path('smt')}`,
    })
  }

  // EXPO / XMP
  if (a.expoXmpActive == null) {
    checks.push({
      label: 'EXPO / XMP profile active',
      verdict: 'unknown',
      detail: 'Could not classify RAM speed (unknown DDR type or no speed reported).',
    })
  } else if (a.expoXmpActive) {
    checks.push({
      label: 'EXPO / XMP profile active',
      verdict: 'pass',
      detail: `${a.ramType ?? '?'} running at ${a.ramSpeedMhz ?? '?'} MHz (above JEDEC default — EXPO/XMP trained).`,
    })
  } else {
    checks.push({
      label: 'EXPO / XMP profile active',
      verdict: 'fail',
      detail: `${a.ramType ?? '?'} running at ${a.ramSpeedMhz ?? '?'} MHz — at or below JEDEC default. You\'re leaving 20-30% of memory perf on the table.`,
      fix:
        `Enable the EXPO/XMP profile.${path('expoXmp')} If POST fails after enabling, your kit + board doesn't train cleanly at the rated speed — drop to DDR5-5600 manually as a fallback.`,
    })
  }

  // Power plan
  if (a.powerPlanName == null) {
    checks.push({
      label: 'Power plan (High Performance / Ultimate)',
      verdict: 'unknown',
      detail: 'Could not read active power plan.',
    })
  } else {
    const name = a.powerPlanName.toLowerCase()
    const isHighPerf =
      name.includes('high performance') ||
      name.includes('ultimate') ||
      name.includes('high perf')
    checks.push({
      label: 'Power plan (High Performance / Ultimate)',
      verdict: isHighPerf ? 'pass' : 'warn',
      detail: `Active plan: ${a.powerPlanName}.`,
      fix: isHighPerf
        ? undefined
        : 'Switch to High Performance or Ultimate Performance. Run `powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61` in admin CMD to unlock Ultimate Performance on Win11, then select it in Settings → Power & battery → Additional power settings.',
    })
  }

  return checks
}

const VERDICT_COLOR: Record<Verdict, string> = {
  pass: 'text-emerald-300',
  warn: 'text-amber-300',
  fail: 'text-red-400',
  unknown: 'text-text-subtle',
}
const VERDICT_GLYPH: Record<Verdict, string> = {
  pass: '✓',
  warn: '◐',
  fail: '✗',
  unknown: '◇',
}

export function BiosAuditCard() {
  const isNative = inTauri()
  const [audit, setAudit] = useState<BiosAudit | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [gameId, setGameId] = useState<GameId>('fortnite')

  async function refresh() {
    if (!isNative) return
    setLoading(true)
    setErr(null)
    try {
      setAudit(await biosAuditProbe())
    } catch (e) {
      setErr(typeof e === 'string' ? e : (e as Error).message ?? String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!isNative) return null

  const profile = GAME_PROFILES.find((g) => g.id === gameId) ?? GAME_PROFILES[0]
  const ui = audit ? findBiosMap(audit.moboManufacturer) : null
  const checks = audit ? buildChecks(audit, profile, ui) : []
  const passCount = checks.filter((c) => c.verdict === 'pass').length
  const failCount = checks.filter((c) => c.verdict === 'fail').length
  const warnCount = checks.filter((c) => c.verdict === 'warn').length

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">BIOS audit</p>
          <h3 className="text-base font-semibold">BIOS settings — what Windows can see</h3>
          {audit && (
            <p className="text-xs text-text-muted leading-snug mt-0.5 max-w-2xl">
              {passCount} pass · {warnCount} warn · {failCount} fail · checking against{' '}
              <span className="text-accent">{profile.label}</span> profile.
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-2.5 py-1 rounded-md border border-border text-[11px] hover:border-border-glow disabled:opacity-50"
        >
          {loading ? 'Probing…' : 'Re-probe'}
        </button>
      </div>

      {audit && (audit.moboManufacturer || audit.moboProduct) && (
        <div className="rounded-md border border-border bg-bg-raised/40 p-3 space-y-1">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-widest text-accent">
              Detected motherboard
            </p>
            {ui && (
              <span className="text-[10px] uppercase tracking-widest text-emerald-300">
                {ui.vendor} BIOS UI map loaded
              </span>
            )}
          </div>
          <p className="text-sm text-text font-mono">
            {audit.moboManufacturer ?? '?'}
            {audit.moboProduct ? ` · ${audit.moboProduct}` : ''}
          </p>
          {(audit.biosVendor || audit.biosVersion || audit.biosReleaseDate) && (
            <p className="text-[11px] text-text-muted font-mono">
              BIOS {audit.biosVendor ?? '?'} {audit.biosVersion ?? ''}
              {audit.biosReleaseDate && ` · ${fmtBiosDate(audit.biosReleaseDate)}`}
            </p>
          )}
          {ui && (
            <p className="text-[11px] text-text-subtle leading-snug">
              <strong className="text-text">{ui.advancedHotkey}.</strong> Vendor-specific menu
              paths are pre-loaded — every fix line below tells you the exact menu tree to
              navigate on your board.
            </p>
          )}
          {!ui && audit.moboManufacturer && (
            <p className="text-[11px] text-amber-200 leading-snug">
              We don't have a curated BIOS-UI map for "{audit.moboManufacturer}" yet (we have
              ASUS, MSI, Gigabyte, ASRock). The generic fix text still works; drop the vendor
              + a screenshot of your BIOS top menu to get a map added.
            </p>
          )}
        </div>
      )}

      <nav className="flex flex-wrap gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-text-subtle mr-1 self-center">
          Profile:
        </span>
        {GAME_PROFILES.map((p) => (
          <button
            key={p.id}
            onClick={() => setGameId(p.id)}
            className={`px-2 py-0.5 text-[11px] rounded border ${
              gameId === p.id
                ? 'bg-accent text-bg-base border-accent'
                : 'bg-bg-card text-text-muted border-border hover:border-border-glow'
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <p className="text-[11px] text-text-subtle leading-snug">{profile.blurb}</p>

      {err && <p className="text-xs text-red-300">Probe failed: {err}</p>}

      {audit && checks.length > 0 && (
        <ul className="space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="rounded-md border border-border p-3 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className={`text-sm font-bold tabular-nums ${VERDICT_COLOR[c.verdict]}`}>
                  {VERDICT_GLYPH[c.verdict]}
                </span>
                <span className="text-sm text-text font-semibold flex-1">{c.label}</span>
                <span className={`text-[10px] uppercase tracking-widest ${VERDICT_COLOR[c.verdict]}`}>
                  {c.verdict}
                </span>
              </div>
              <p className="text-[11px] text-text-muted leading-snug pl-6">{c.detail}</p>
              {c.fix && (
                <p className="text-[11px] text-amber-200 leading-snug pl-6">
                  <span className="text-accent font-semibold">→ </span>
                  {c.fix}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {ui ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-emerald-300 font-semibold">
              ✓ Tunable in your {ui.vendor} BIOS UI
            </p>
            <ul className="text-[11px] text-text-muted leading-snug space-y-0.5">
              {ui.exposedInUi.map((item, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-emerald-300 shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-text-subtle leading-snug pt-1">
              These you can flip directly from BIOS without any extra tooling.
            </p>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-amber-300 font-semibold">
              ◇ Needs SCEWIN on {ui.vendor}
            </p>
            <ul className="text-[11px] text-text-muted leading-snug space-y-0.5">
              {ui.needsScewin.map((item, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-amber-300 shrink-0">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-text-subtle leading-snug pt-1">
              Read-only SCEWIN dump exposes these — see{' '}
              <Link
                to="/guides#scewin-advanced"
                className="text-accent underline hover:text-text"
              >
                /guides → SCEWIN
              </Link>{' '}
              for the 4-step workflow.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-text-subtle/30 bg-bg-raised/30 p-3 space-y-1.5">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle font-semibold">
            What we can't read from Windows
          </p>
          <ul className="text-[11px] text-text-muted leading-snug space-y-0.5">
            <li className="flex gap-1.5">
              <span className="text-text-subtle">·</span>
              <span>
                <strong className="text-text">PBO / Curve Optimizer per-core offsets</strong> — only visible in BIOS UI or via a SCEWIN dump.
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="text-text-subtle">·</span>
              <span>
                <strong className="text-text">EXPO timing values</strong> — we see the freq is above JEDEC, but not whether the timings landed at the rated CL30 or auto-loosened to CL36.
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="text-text-subtle">·</span>
              <span>
                <strong className="text-text">SVID Behavior / LLC / voltage curves</strong> — Intel + AMD voltage tuning lives entirely in BIOS NVRAM.
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="text-text-subtle">·</span>
              <span>
                <strong className="text-text">Resizable BAR, PCIe Gen running</strong> — queued for a follow-up release; needs nvidia-smi integration.
              </span>
            </li>
          </ul>
          <p className="text-[11px] text-text-muted leading-snug">
            For the full audit, run a SCEWIN dump and compare against a known-good profile —{' '}
            <Link to="/guides#scewin-advanced" className="text-accent underline hover:text-text">
              /guides → SCEWIN
            </Link>
            {' '}walks the 4-step workflow.
          </p>
        </div>
      )}
    </section>
  )
}
