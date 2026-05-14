import { useEffect, useState } from 'react'
import {
  driverHealth,
  driverOracle,
  inTauri,
  openExternal,
  type DriverEntry,
  type DriverHealthReport,
  type DriverOracleResponse,
  type DriverOracleSource,
} from '../lib/tauri'

/**
 * Driver health card. WMI Win32_PnPSignedDriver pass that surfaces:
 *
 *  1. **Known-bad** drivers (bundled blocklist of versions with documented
 *     regressions). Red badge: "Update now".
 *  2. **Update available** — computed client-side by comparing
 *     `friendlyVersion` against `optmaxxing-driver-oracle.workers.dev/latest`,
 *     which scrapes vendor sites daily. Amber badge: "Update available —
 *     v596.49 (May 12)". Only fires when we actually have a latest-version
 *     fact from the oracle.
 *  3. **Stable** — no known-bad match AND we either confirmed via the oracle
 *     that the installed version equals latest, OR we have no authoritative
 *     latest version to compare against (which is honest — we never warn
 *     based on driver age alone).
 *
 * Vendor download links open in the external browser so users can grab the
 * latest installer themselves. No auto-update.
 */
const DOWNLOAD_LINKS: Array<{ match: RegExp; label: string; url: string }> = [
  { match: /nvidia|geforce|rtx|gtx/i, label: 'NVIDIA drivers', url: 'https://www.nvidia.com/Download/index.aspx' },
  { match: /\bamd\b|radeon/i, label: 'AMD drivers', url: 'https://www.amd.com/en/support' },
  { match: /intel.*arc|intel.*graphics/i, label: 'Intel Arc drivers', url: 'https://www.intel.com/content/www/us/en/download-center/home.html' },
  { match: /realtek/i, label: 'Realtek drivers', url: 'https://www.realtek.com/en/component/zoo/category/network-interface-controllers-10-100-1000m-gigabit-ethernet-pci-express-software' },
  { match: /killer|qualcomm.*atheros/i, label: 'Killer Performance Suite', url: 'https://www.killernetworking.com/driver-downloads/' },
  { match: /intel.*ethernet|intel.*i225|intel.*i226/i, label: 'Intel ethernet drivers', url: 'https://www.intel.com/content/www/us/en/download-center/home.html' },
]

function vendorLink(d: DriverEntry): { label: string; url: string } | null {
  const haystack = `${d.deviceName} ${d.vendor}`
  for (const link of DOWNLOAD_LINKS) {
    if (link.match.test(haystack)) return { label: link.label, url: link.url }
  }
  return null
}

/** Lift a vendor source out of the oracle, only when it has a real version
 *  string. Error / null sources collapse to null. */
function pickOracleSource(
  oracle: DriverOracleResponse | null,
  key: 'nvidia' | 'amd' | 'intel_arc',
): DriverOracleSource | null {
  const s = oracle?.sources[key]
  if (!s) return null
  if ('error' in s) return null
  return s
}

/** Match a driver entry against an oracle source. We look the driver up by
 *  vendor + product family. Today: NVIDIA only. AMD / Intel Arc stub null. */
function oracleSourceFor(
  d: DriverEntry,
  oracle: DriverOracleResponse | null,
): DriverOracleSource | null {
  const v = d.vendor.toLowerCase()
  const n = d.deviceName.toLowerCase()
  const isNvidia = v.includes('nvidia') || n.includes('nvidia') || n.includes('geforce')
  if (isNvidia && d.classLabel === 'GPU') return pickOracleSource(oracle, 'nvidia')
  return null
}

type Verdict =
  | { kind: 'known-bad'; reason: string }
  | { kind: 'update-available'; source: DriverOracleSource }
  | { kind: 'stable'; verified: boolean }

function classifyDriver(d: DriverEntry, oracle: DriverOracleResponse | null): Verdict {
  if (d.knownBad) return { kind: 'known-bad', reason: d.knownBad }
  const src = oracleSourceFor(d, oracle)
  if (src && d.friendlyVersion) {
    if (versionIsOlder(d.friendlyVersion, src.version)) {
      return { kind: 'update-available', source: src }
    }
    return { kind: 'stable', verified: true }
  }
  return { kind: 'stable', verified: false }
}

/** Loose numeric compare suitable for both NVIDIA (XXX.XX) and AMD (X.Y.Z)
 *  formats. Returns true iff installed < latest. */
function versionIsOlder(installed: string, latest: string): boolean {
  const parse = (s: string) => s.split(/[.\-]/).map((p) => parseInt(p, 10) || 0)
  const a = parse(installed)
  const b = parse(latest)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av < bv) return true
    if (av > bv) return false
  }
  return false
}

function isDriverFlagged(verdict: Verdict): boolean {
  return verdict.kind === 'known-bad' || verdict.kind === 'update-available'
}

export function DriverHealthCard() {
  const isNative = inTauri()
  const [report, setReport] = useState<DriverHealthReport | null>(null)
  const [oracle, setOracle] = useState<DriverOracleResponse | null>(null)
  const [oracleAttempted, setOracleAttempted] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  async function refresh() {
    if (!isNative) return
    setLoading(true)
    setErr(null)
    try {
      const [r, o] = await Promise.all([driverHealth(), driverOracle()])
      setReport(r)
      setOracle(o)
      setOracleAttempted(true)
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

  const allDrivers = report?.drivers ?? []
  const verdicts = allDrivers.map((d) => ({ d, verdict: classifyDriver(d, oracle) }))
  const flagged = verdicts.filter((v) => isDriverFlagged(v.verdict))
  const visible = showAll ? verdicts : flagged

  const summary = (() => {
    if (!report) return null
    const bad = verdicts.filter((v) => v.verdict.kind === 'known-bad').length
    const update = verdicts.filter((v) => v.verdict.kind === 'update-available').length
    const verified = verdicts.filter(
      (v) => v.verdict.kind === 'stable' && v.verdict.verified,
    ).length
    if (bad === 0 && update === 0) {
      if (verified > 0) {
        return `${verified} driver${verified > 1 ? 's' : ''} confirmed up-to-date against vendor-latest. Others have no public version oracle — installed version + date shown for reference.`
      }
      return `${allDrivers.length} drivers scanned. No known-bad matches. We don't have an oracle for ${allDrivers.length > 1 ? 'these vendors' : 'this vendor'} yet — see "show all" for installed versions.`
    }
    const parts: string[] = []
    if (bad > 0) parts.push(`${bad} on the known-bad blocklist — update now`)
    if (update > 0) parts.push(`${update} update${update > 1 ? 's' : ''} available from vendor`)
    return parts.join(' · ')
  })()

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">driver health</p>
          <h3 className="text-base font-semibold">Drivers — known-bad + vendor-version check</h3>
          {summary && (
            <p className="text-xs text-text-muted leading-snug mt-0.5 max-w-2xl">{summary}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {report && allDrivers.length > flagged.length && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-[11px] underline text-text-muted hover:text-text"
            >
              {showAll ? 'flagged only' : `show all ${allDrivers.length}`}
            </button>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            className="px-2.5 py-1 rounded-md border border-border text-[11px] hover:border-border-glow disabled:opacity-50"
          >
            {loading ? 'Scanning…' : 'Re-scan'}
          </button>
        </div>
      </div>

      {err && <p className="text-xs text-red-300">Scan failed: {err}</p>}

      {oracleAttempted && !oracle && (
        <p className="text-[11px] text-amber-300 leading-snug">
          ⚠ Driver-oracle worker unreachable — falling back to known-bad-only checks. Versions
          shown below are your installed values; no vendor-latest comparison this session.
        </p>
      )}

      {report && allDrivers.length === 0 && !loading && (
        <p className="text-xs text-text-subtle italic">
          WMI returned no PnP drivers with version strings. Re-run the scan from an admin shell
          if this persists.
        </p>
      )}

      {flagged.length === 0 && allDrivers.length > 0 && !showAll && (
        <p className="text-xs text-emerald-300">
          ✓ Nothing flagged. {allDrivers.length} driver{allDrivers.length > 1 ? 's' : ''} clean.
        </p>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map(({ d, verdict }, i) => (
            <DriverRow key={`${d.classLabel}-${d.deviceName}-${i}`} d={d} verdict={verdict} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-text-subtle leading-snug pt-2 border-t border-border">
        Vendor-latest comes from{' '}
        <button
          onClick={() => openExternal('https://optmaxxing-driver-oracle.maxxtopia.workers.dev/latest')}
          className="underline hover:text-text"
        >
          our daily scrape worker
        </button>
        {oracle && (
          <span> · last refreshed {new Date(oracle.fetchedAt).toLocaleString()}</span>
        )}
        . NVIDIA today; AMD + Intel Arc lack public APIs so we don't pretend to know their latest
        versions. For major NVIDIA jumps, run{' '}
        <button
          onClick={() =>
            openExternal('https://www.guru3d.com/download/display-driver-uninstaller-download/')
          }
          className="underline hover:text-text"
        >
          DDU
        </button>{' '}
        in safe mode before installing.
      </p>
    </section>
  )
}

function DriverRow({ d, verdict }: { d: DriverEntry; verdict: Verdict }) {
  const link = vendorLink(d)
  const version = d.friendlyVersion ?? d.rawVersion
  const date = d.driverDate ?? 'date unknown'
  const ageLabel =
    d.ageDays == null
      ? ''
      : d.ageDays < 30
      ? `${d.ageDays}d old`
      : d.ageDays < 365
      ? `${Math.round(d.ageDays / 30)}mo old`
      : `${(d.ageDays / 365).toFixed(1)}y old`

  const badge =
    verdict.kind === 'known-bad'
      ? {
          color: 'text-red-300 border-red-500/40 bg-red-500/10',
          label: 'Update now',
          tooltip:
            'This driver version is on a bundled list of known-bad releases — update to the vendor\'s latest as soon as you can.',
        }
      : verdict.kind === 'update-available'
      ? {
          color: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
          label: `Update available — v${verdict.source.version}`,
          tooltip:
            verdict.source.released
              ? `Vendor released v${verdict.source.version} on ${verdict.source.released}. Your installed version is older — click the vendor link to download.`
              : `Vendor latest is v${verdict.source.version}. Your installed version is older.`,
        }
      : verdict.verified
      ? {
          color: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
          label: 'Stable · up to date',
          tooltip:
            'We compared your installed version to the vendor\'s latest (from our daily scrape) and they match. No known-bad flag either.',
        }
      : {
          color: 'text-text-muted border-border bg-transparent',
          label: 'Stable',
          tooltip:
            'No known-bad flag matched. We don\'t have a vendor-latest oracle for this driver class, so we can\'t confirm whether a newer version exists — we won\'t guess based on driver age alone.',
        }

  return (
    <div className="rounded-md border border-border p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">
            {d.classLabel} · {d.vendor}
          </p>
          <p className="text-sm text-text font-mono truncate">{d.deviceName}</p>
        </div>
        <span
          title={badge.tooltip}
          className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border whitespace-nowrap ${badge.color}`}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-[11px] text-text-muted font-mono">
        v{version}
        {d.friendlyVersion && (
          <span className="text-text-subtle ml-1">(wmi {d.rawVersion})</span>
        )}{' '}
        · {date} {ageLabel && <span className="text-text-subtle">· {ageLabel}</span>}
      </p>
      {verdict.kind === 'known-bad' && (
        <p className="text-[11px] text-red-300 leading-snug">⚠ {verdict.reason}</p>
      )}
      {verdict.kind === 'update-available' && verdict.source.released && (
        <p className="text-[11px] text-amber-300 leading-snug">
          Vendor released v{verdict.source.version} on {verdict.source.released}.
        </p>
      )}
      <div className="flex items-center gap-3">
        {link && (
          <button
            onClick={() => openExternal(link.url)}
            className="text-[11px] underline text-accent hover:text-text"
          >
            {link.label} ↗
          </button>
        )}
        {verdict.kind === 'update-available' && verdict.source.detailsUrl && (
          <button
            onClick={() => openExternal(verdict.source.detailsUrl!)}
            className="text-[11px] underline text-text-muted hover:text-text"
          >
            Release notes ↗
          </button>
        )}
      </div>
    </div>
  )
}
