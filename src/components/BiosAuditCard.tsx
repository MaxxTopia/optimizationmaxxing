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
 * For the BIOS values Windows can't read (PBO offsets, Curve Optimizer
 * per-core values, EXPO timing tables, SVID Behavior), the card points to
 * the SCEWIN dump-and-diff workflow in /guides.
 */

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

function buildChecks(a: BiosAudit, profile: GameProfile): Check[] {
  const checks: Check[] = []

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
        'CSM ON disables Resizable BAR and adds ~2s to boot. BIOS → Boot → CSM/Compatibility Support Module → Disabled. (Heads-up: switching off CSM may require reinstalling Windows on UEFI/GPT if the current install is BIOS/MBR.)',
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
            ? `${profile.label} requires Secure Boot for anti-cheat eligibility. BIOS → Boot → Secure Boot → Enabled. Set "OS Type" to "Other OS" if your board defaults to Windows-only signing.`
            : 'Optional for this title, but enable it if you also play FACEIT/Vanguard/FNCS.',
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
            ? `${profile.label} requires TPM 2.0. BIOS → Security or Advanced → fTPM (AMD) or PTT (Intel) → Enabled. Then in Windows run "tpm.msc" to verify it shows Ready.`
            : 'Optional for this title — enable if you also play Valorant or FNCS.',
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
        'SMT off is a CS:GO/Overwatch-1-era esports trick that doesn\'t apply to UE5 games. Turn it back ON in BIOS → Advanced → CPU Configuration.',
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
        'BIOS → Ai Tweaker / Extreme Tweaker / Overclocking → DOCP / EXPO / XMP → enable Profile 1. If POST fails after enabling, your kit + board doesn\'t train cleanly at the rated speed — drop to DDR5-5600 manually as a fallback.',
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
  const checks = audit ? buildChecks(audit, profile) : []
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

      <div className="rounded-md border border-text-subtle/30 bg-bg-raised/30 p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle font-semibold">
          What we can't read from Windows
        </p>
        <ul className="text-[11px] text-text-muted leading-snug space-y-0.5">
          <li className="flex gap-1.5">
            <span className="text-text-subtle">·</span>
            <span><strong className="text-text">PBO / Curve Optimizer per-core offsets</strong> — only visible in BIOS UI or via a SCEWIN dump.</span>
          </li>
          <li className="flex gap-1.5">
            <span className="text-text-subtle">·</span>
            <span><strong className="text-text">EXPO timing values</strong> — we see the freq is above JEDEC, but not whether the timings landed at the rated CL30 or auto-loosened to CL36.</span>
          </li>
          <li className="flex gap-1.5">
            <span className="text-text-subtle">·</span>
            <span><strong className="text-text">SVID Behavior / LLC / voltage curves</strong> — Intel + AMD voltage tuning lives entirely in BIOS NVRAM.</span>
          </li>
          <li className="flex gap-1.5">
            <span className="text-text-subtle">·</span>
            <span><strong className="text-text">Resizable BAR, PCIe Gen running</strong> — queued for a follow-up release; needs nvidia-smi integration.</span>
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
    </section>
  )
}
