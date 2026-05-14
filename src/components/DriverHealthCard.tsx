import { useEffect, useState } from 'react'
import {
  driverHealth,
  inTauri,
  openExternal,
  type DriverEntry,
  type DriverHealthReport,
} from '../lib/tauri'

/**
 * Driver health card. WMI Win32_PnPSignedDriver pass that surfaces stale +
 * known-bad drivers across GPU / chipset / audio / network / storage. Not a
 * driver-update notifier — we don't fetch the latest version from
 * NVIDIA/AMD. The honest line: if your driver is older than the class
 * threshold (90d for GPU, 18mo for everything else) or matches a bundled
 * known-bad version, we surface it; otherwise it's a "looks fine" pass.
 *
 * Vendor download links open in the external browser so the user can grab
 * the latest installer themselves.
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

export function DriverHealthCard() {
  const isNative = inTauri()
  const [report, setReport] = useState<DriverHealthReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)

  async function refresh() {
    if (!isNative) return
    setLoading(true)
    setErr(null)
    try {
      setReport(await driverHealth())
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
  const flagged = allDrivers.filter((d) => d.stale || d.knownBad)
  const visible = showAll ? allDrivers : flagged

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-text-subtle">driver health</p>
          <h3 className="text-base font-semibold">Drivers — stale + known-bad scan</h3>
          {report && (
            <p className="text-xs text-text-muted leading-snug mt-0.5 max-w-2xl">
              {report.note}
            </p>
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

      {report && allDrivers.length === 0 && !loading && (
        <p className="text-xs text-text-subtle italic">
          WMI returned no PnP drivers with version strings. Re-run the scan from an admin shell
          if this persists.
        </p>
      )}

      {flagged.length === 0 && allDrivers.length > 0 && !showAll && (
        <p className="text-xs text-emerald-300">
          ✓ Nothing flagged. {allDrivers.length} drivers in the fresh-window with no known-bad
          matches.
        </p>
      )}

      {visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((d, i) => (
            <DriverRow key={`${d.classLabel}-${d.deviceName}-${i}`} d={d} />
          ))}
        </div>
      )}

      <p className="text-[10px] text-text-subtle leading-snug pt-2 border-t border-border">
        We don't auto-update drivers — this is a read-only scan. Click any vendor link to grab the
        latest installer yourself. NVIDIA users should also run{' '}
        <button
          onClick={() =>
            openExternal('https://www.guru3d.com/download/display-driver-uninstaller-download/')
          }
          className="underline hover:text-text"
        >
          DDU
        </button>{' '}
        in safe mode before a major version jump.
      </p>
    </section>
  )
}

function DriverRow({ d }: { d: DriverEntry }) {
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

  const badge = d.knownBad
    ? { color: 'text-red-300 border-red-500/40 bg-red-500/10', label: 'known-bad' }
    : d.stale
    ? { color: 'text-amber-300 border-amber-500/40 bg-amber-500/10', label: 'stale' }
    : { color: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10', label: 'ok' }

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
          className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${badge.color}`}
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
      {d.knownBad && (
        <p className="text-[11px] text-red-300 leading-snug">⚠ {d.knownBad}</p>
      )}
      {link && (
        <button
          onClick={() => openExternal(link.url)}
          className="text-[11px] underline text-accent hover:text-text"
        >
          {link.label} ↗
        </button>
      )}
    </div>
  )
}
