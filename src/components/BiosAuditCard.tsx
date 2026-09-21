import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  biosAuditProbe,
  inTauri,
  type BiosAudit,
} from '../lib/tauri'
import { BoardFirmwareEvidenceCard } from './BoardFirmwareEvidenceCard'
import { ScewinDumpInspector } from './ScewinDumpInspector'

/**
 * BiosAuditCard — read what Windows can see about BIOS settings + compare
 * against the per-game ideal config. Pass/warn/fail/unknown punchlist with
 * read-only context and a safe next step per finding.
 *
 * Detects Windows-visible board/firmware identity, but deliberately avoids
 * claiming a setting path or availability from vendor name alone. The
 * read-only SCEWIN importer below only reports records present in the user's
 * export; absence is never treated as proof that firmware lacks a setting.
 */

type BiosVendor = 'ASUS' | 'MSI' | 'Gigabyte' | 'ASRock'

function findBiosVendor(manufacturer: string | null): BiosVendor | null {
  if (!manufacturer) return null
  const m = manufacturer.toLowerCase()
  if (m.includes('asus')) return 'ASUS'
  if (m.includes('msi') || m.includes('micro-star')) return 'MSI'
  if (m.includes('gigabyte') || m.includes('aorus')) return 'Gigabyte'
  if (m.includes('asrock')) return 'ASRock'
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
  ideal: {
    secureBoot: 'required' | 'preferred' | 'optional'
    tpm: 'required' | 'preferred' | 'optional'
  }
}

const GAME_PROFILES: GameProfile[] = [
  {
    id: 'fortnite',
    label: 'Fortnite',
    blurb:
      'Epic documents TPM 2.0 + Secure Boot for certain tournaments and IOMMU for some competitive experiences. Requirements can vary by event; this audit is not an eligibility check.',
    ideal: {
      secureBoot: 'preferred',
      tpm: 'preferred',
    },
  },
  {
    id: 'valorant',
    label: 'Valorant',
    blurb:
      'Secure Boot and TPM requirements can depend on Windows version and current Riot policy. Verify in Riot support; this read-only audit does not guarantee launch or event eligibility.',
    ideal: {
      secureBoot: 'preferred',
      tpm: 'preferred',
    },
  },
  {
    id: 'cs2',
    label: 'CS2',
    blurb:
      'Secure Boot and TPM are not universal CS2 performance settings. Event-platform requirements may differ; this card does not certify eligibility.',
    ideal: {
      secureBoot: 'optional',
      tpm: 'optional',
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

  // This is the Windows boot path, not a direct read of the firmware's CSM
  // toggle or every boot option.
  if (a.biosMode == null) {
    checks.push({
      label: 'Firmware boot mode',
      verdict: 'unknown',
      detail: 'Could not read BIOS firmware type.',
    })
  } else if (a.biosMode.toLowerCase() === 'uefi') {
    checks.push({
      label: 'Firmware boot mode',
      verdict: 'pass',
      detail: 'Windows reports UEFI startup. This does not prove the exact state of every CSM or boot option.',
    })
  } else {
    checks.push({
      label: 'Firmware boot mode',
      verdict: 'warn',
      detail: `Windows reports ${a.biosMode} startup. This is not a direct read of each firmware boot option.`,
      fix: 'If an event or feature requires UEFI/Secure Boot, verify the exact motherboard manual and Windows partition style before changing boot mode; switching modes without preparation can make Windows unbootable.',
    })
  }

  // Secure Boot
  if (a.secureBoot == null) {
      checks.push({
        label: 'Secure Boot',
        verdict: 'unknown',
        detail: 'Windows could not report Secure Boot state. Check System Information and the exact board manual.',
    })
  } else {
    const need = profile.ideal.secureBoot
    if (a.secureBoot) {
      checks.push({
        label: 'Secure Boot',
        verdict: 'pass',
        detail: 'Windows reports Secure Boot enabled. This is not a tournament attestation result.',
      })
    } else {
      checks.push({
        label: 'Secure Boot',
        verdict: need === 'required' ? 'fail' : 'warn',
        detail: 'Disabled.',
        fix: need === 'required'
          ? `Epic requires Secure Boot for some tournament eligibility checks. Verify the current event rules and your exact board's manual; do not change Secure Boot mode or keys from a generic menu recipe.`
          : 'Only change this for a current game/event requirement or a deliberate security policy; use your board manual.',
      })
    }
  }

  // TPM
  if (a.tpmEnabled == null) {
    checks.push({
      label: 'TPM status',
      verdict: 'unknown',
      detail: 'Could not query TPM state. Press Win+R and run tpm.msc to inspect the Windows-reported version and readiness.',
    })
  } else {
    const need = profile.ideal.tpm
    if (a.tpmEnabled) {
      checks.push({
        label: 'TPM status',
        verdict: 'pass',
        detail: 'Windows reports a TPM present and enabled/ready. This probe does not verify the TPM specification version; confirm 2.0 in tpm.msc.',
      })
    } else {
      checks.push({
        label: 'TPM status',
        verdict: need === 'required' ? 'fail' : 'warn',
        detail: 'Not ready or disabled in BIOS / Windows.',
        fix:
          need === 'required'
            ? `Epic requires TPM 2.0 for some tournament eligibility checks. Confirm the version in tpm.msc, then use the exact board manual if the event requires a firmware change.`
            : 'Only change this for a current game/event requirement or a deliberate security policy; check your board manual.',
      })
    }
  }

  // This is an OS topology signal, not a universal gaming-performance verdict.
  if (a.smtEnabled == null) {
    checks.push({
      label: 'SMT / Hyper-Threading signal',
      verdict: 'unknown',
      detail: 'Could not derive logical-vs-physical core count.',
    })
  } else {
    checks.push({
      label: 'SMT / Hyper-Threading signal',
      verdict: 'unknown',
      detail: a.smtEnabled
        ? 'Windows sees more logical than physical cores. This suggests SMT/HT is enabled; it does not prove lower latency or better FPS.'
        : 'Windows sees no extra logical cores. Hybrid CPU topology can make this inference incomplete; benchmark before changing firmware.',
    })
  }

  const memorySpeeds = [
    a.ramConfiguredMhz != null ? `configured ${a.ramConfiguredMhz} MT/s` : null,
    a.ramSpeedMhz != null ? `module field ${a.ramSpeedMhz} MT/s` : null,
  ].filter(Boolean)
  checks.push({
    label: 'Memory profile / timings',
    verdict: 'unknown',
    detail: `${a.ramType ?? 'Memory type not identified'}${memorySpeeds.length ? ` · ${memorySpeeds.join(' · ')}` : ''}. Windows clock data does not establish XMP/EXPO selection, trained timings, kit rating, or stability.`,
    fix: 'Inspect the profile and DIMM specifications in the exact board firmware. Use matched-kit/QVL information and validate stability; do not infer safe timings or voltage from another kit.',
  })

  checks.push({
    label: 'Active Windows power plan',
    verdict: 'unknown',
    detail: a.powerPlanName
      ? `${a.powerPlanName}${a.powerPlanGuid ? ` · ${a.powerPlanGuid}` : ''}. The plan name alone does not predict game latency; measure frametimes and clocks under your workload.`
      : 'Could not read active plan. Even when present, the name alone does not establish performance.',
  })

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
  const vendor = audit ? findBiosVendor(audit.moboManufacturer) : null
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

      {audit && (audit.moboManufacturer || audit.moboProduct || audit.biosVersion) && (
        <div className="rounded-md border border-border bg-bg-raised/40 p-3 space-y-1">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <p className="text-[10px] uppercase tracking-widest text-accent">
              Detected board / firmware identity
            </p>
            {vendor && (
              <span className="text-[10px] uppercase tracking-widest text-text-subtle">
                Vendor family: {vendor}
              </span>
            )}
          </div>
          <p className="text-sm text-text font-mono">
            {audit.moboManufacturer ?? '?'}
            {audit.moboProduct ? ` · ${audit.moboProduct}` : ''}
            {audit.moboRevision ? ` · rev ${audit.moboRevision}` : ''}
          </p>
          {(audit.biosVendor || audit.biosVersion || audit.biosReleaseDate) && (
            <p className="text-[11px] text-text-muted font-mono">
              BIOS {audit.biosVendor ?? '?'} {audit.biosVersion ?? ''}
              {audit.biosReleaseDate && ` · ${fmtBiosDate(audit.biosReleaseDate)}`}
            </p>
          )}
          <p className="text-[11px] text-text-subtle leading-snug">
            {vendor
              ? `${vendor} identifies the manufacturer family only. Menu paths and option availability depend on the exact board revision and BIOS; use its official manual. This app does not label a setting “visible” from vendor alone.`
              : 'Windows has not provided a recognized board vendor. Use the exact board/OEM manual; this app will not guess menu paths.'}
          </p>
          {!audit.moboProduct && (
            <p className="text-[11px] text-amber-200 leading-snug">
              Windows did not report a board model. Exact model-specific guidance is unavailable until the board identity is known.
            </p>
          )}
        </div>
      )}

      {audit && <BoardFirmwareEvidenceCard audit={audit} />}

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

      {audit && <ScewinDumpInspector audit={audit} />}

      <p className="text-[11px] text-text-subtle leading-snug border-t border-border pt-3">
        Windows cannot enumerate every setup variable. A SCEWIN export is partial evidence: a listed value is only what that export reports, while an unlisted option remains unknown. Use the{' '}
        <Link to="/guides#scewin-advanced" className="text-accent underline hover:text-text">
          read-only SCEWIN guide
        </Link>{' '}
        for export instructions. BIOS recommendations require exact board/BIOS and component evidence; no firmware writes occur here.
      </p>
    </section>
  )
}
