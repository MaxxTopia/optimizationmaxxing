import { useEffect, useState } from 'react'
import { inTauri, monitorInventory, openExternal, type MonitorReport } from '../lib/tauri'

/** Per-monitor optimal competitive-gaming OSD settings. Curated against
 *  manufacturer specs + RTINGS / TFTCentral / Hardware Unboxed reviews.
 *  Lookup is by EDID product code (most specific) with a model-name
 *  substring fallback. Adding a monitor = one entry. Verified May 2026. */
interface MonitorSettings {
  /** EDID product code match (most specific). */
  productCode?: string
  /** Substring match on the EDID model string (lowercased compare). */
  modelMatch?: string
  /** Display name in the card header. */
  displayName: string
  /** Bullet rows: { label, value, why? }. */
  settings: Array<{ label: string; value: string; why?: string }>
  /** Source URL (RTINGS review, manufacturer spec sheet, etc). */
  sourceUrl?: string
  sourceLabel?: string
}

const MONITOR_SETTINGS: MonitorSettings[] = [
  {
    modelMatch: 'aw2523hf',
    displayName: 'Dell Alienware AW2523HF — competitive Fortnite OSD',
    settings: [
      { label: 'Refresh rate', value: '360 Hz', why: 'Cap reaching its native max — use this in Windows + game' },
      { label: 'Response time', value: 'Super Fast', why: 'Lowest pixel-response without visible overshoot — "Extreme" introduces inverse ghosting on the IPS panel' },
      { label: 'AlienVision Dark Stabilizer', value: '2', why: 'Lifts dark scenes a touch without crushing contrast — pro Fortnite consensus' },
      { label: 'Game / Preset Mode', value: 'FPS', why: 'Locks gamma + saturation to a competitive-friendly profile' },
      { label: 'Smart HDR', value: 'OFF', why: 'HDR adds 5-15ms input lag on this panel' },
      { label: 'AMD FreeSync / NVIDIA G-Sync Compatible', value: 'OFF', why: 'Fortnite pros run VRR off at 360 Hz — when your FPS is stable above refresh, the marginal G-Sync latency cost (per Blur Busters G-Sync 101) loses to raw V-Sync-off + uncapped rendering. Pair with V-Sync OFF in-game + NVIDIA Reflex Low Latency + BOOST instead.' },
      { label: 'V-Sync (in-game + NVCP)', value: 'OFF everywhere', why: 'Eliminates the V-Sync queue. Tearing at 360+ Hz is effectively invisible on this panel' },
      { label: 'NVIDIA Reflex', value: 'On + BOOST', why: 'Caps the driver\'s pre-render queue + raises GPU clocks during the queue-empty window. Replaces what G-Sync was doing for frame pacing, with less latency' },
      { label: 'Sharpness', value: '50 (default)', why: 'Avoid over-sharpening — adds halos to outlines pros use for aim cues' },
      { label: 'Gamma', value: '2.2', why: 'Web/sRGB standard; matches what content creators target' },
      { label: 'Brightness', value: '60-75', why: 'Native panel target. >85 reduces lifespan' },
    ],
    sourceUrl: 'https://www.rtings.com/monitor/reviews/dell/alienware-aw2523hf',
    sourceLabel: 'RTINGS — AW2523HF review',
  },
  {
    modelMatch: 'aw2521h',
    displayName: 'Dell Alienware AW2521H (Bugha\'s monitor) — competitive Fortnite OSD',
    settings: [
      { label: 'Refresh rate', value: '360 Hz', why: 'Native max — set in Windows display + game' },
      { label: 'Response time', value: 'Super Fast', why: 'Lowest perceptible overshoot on this panel' },
      { label: 'Dark Stabilizer', value: '2-3', why: 'Lifts shadow detail without losing contrast — Bugha runs 2' },
      { label: 'NVIDIA G-Sync', value: 'OFF for Fortnite', why: 'Even with the native G-Sync module, Fortnite pros at 360 Hz disable it. Stable FPS above refresh + no visible tearing at this rate beats the ~1ms G-Sync overhead. V-Sync OFF + NVIDIA Reflex + cap nowhere or refresh-3 in-game' },
      { label: 'Preset Mode', value: 'FPS', why: 'Locks color + gamma for competitive contrast' },
      { label: 'Smart HDR', value: 'OFF', why: '~7ms extra input lag with HDR on this panel' },
      { label: 'Sharpness', value: '50', why: 'Default — over-sharpening adds outline halos' },
    ],
    sourceUrl: 'https://www.rtings.com/monitor/reviews/dell/alienware-aw2521h',
    sourceLabel: 'RTINGS — AW2521H review',
  },
  {
    modelMatch: 'xl2566k',
    displayName: 'ZOWIE XL2566K (Peterbot\'s monitor) — competitive OSD',
    settings: [
      { label: 'Refresh rate', value: '360 Hz', why: 'Native max — set in Windows + game' },
      { label: 'DyAC+', value: 'High', why: 'Backlight-strobing for motion clarity; ZOWIE\'s exclusive feature. Adds ~2ms perceived lag but the trail-blur reduction is worth it for tracking aim' },
      { label: 'AMA (response time)', value: 'High', why: 'Premium balances overshoot; High is the pro consensus' },
      { label: 'Black eQualizer', value: '10-12', why: 'ZOWIE\'s shadow-lift equivalent — Peterbot runs ~10' },
      { label: 'Color Vibrance', value: '15-18', why: 'Pops outlines without over-saturating skin tones' },
      { label: 'Sharpness', value: '5 (max)', why: 'ZOWIE\'s sharpness scale is conservative; max is fine here' },
      { label: 'Picture Mode', value: 'FPS1 or FPS2', why: 'FPS1 = brighter, FPS2 = better motion clarity. Try both' },
      { label: 'Brightness', value: '~50', why: 'DyAC+ cuts perceived brightness ~50%; compensate up' },
    ],
    sourceUrl: 'https://www.tftcentral.co.uk/reviews/zowie-xl2566k',
    sourceLabel: 'TFTCentral — XL2566K review',
  },
  {
    modelMatch: 'xl2546k',
    displayName: 'ZOWIE XL2546K — competitive OSD',
    settings: [
      { label: 'Refresh rate', value: '240 Hz', why: 'Native max' },
      { label: 'DyAC+', value: 'High', why: 'Same motion-clarity case as the XL2566K' },
      { label: 'Black eQualizer', value: '10', why: 'Standard pro setting' },
      { label: 'Color Vibrance', value: '15', why: 'Outline pop without saturation halos' },
      { label: 'Picture Mode', value: 'FPS1', why: 'Standard CS/Val tournament mode' },
    ],
  },
  {
    modelMatch: 'aw2518',
    displayName: 'Dell Alienware AW2518 (Reet\'s monitor) — competitive OSD',
    settings: [
      { label: 'Refresh rate', value: '240 Hz (AW2518HF) / 240 Hz G-Sync (AW2518H)', why: 'Set in Windows + Fortnite' },
      { label: 'Response time', value: 'Super Fast', why: 'Cleanest pixel response without visible inverse ghosting' },
      { label: 'Dark Stabilizer', value: '2', why: 'Conservative shadow lift; Reet runs ~2' },
      { label: 'Preset Mode', value: 'FPS', why: 'Locks color + gamma to competitive' },
      { label: 'G-Sync / FreeSync', value: 'OFF for competitive Fortnite', why: 'At 240+ Hz with stable FPS above refresh, pros run VRR off for the marginal latency win (Blur Busters G-Sync 101). V-Sync off + NVIDIA Reflex + uncapped or refresh-3 cap instead' },
    ],
    sourceUrl: 'https://prosettings.net/players/reet/',
    sourceLabel: 'ProSettings — Reet config',
  },
]

function findMonitorSettings(productCode: string, model: string): MonitorSettings | null {
  const code = productCode.trim().toLowerCase()
  const m = model.trim().toLowerCase()
  // Product-code match wins (more specific). Model-name substring match is
  // the fallback for monitors that share a product code across SKUs.
  return (
    MONITOR_SETTINGS.find((s) => s.productCode && s.productCode.toLowerCase() === code) ??
    MONITOR_SETTINGS.find((s) => s.modelMatch && m.includes(s.modelMatch.toLowerCase())) ??
    null
  )
}

/**
 * Monitor firmware reminder card. Reads EDID via WmiMonitorID, identifies
 * each connected display's vendor + model + manufacture date, and surfaces
 * the vendor's required firmware/control tool with a deep-link to their
 * support page. Windows doesn't expose monitor firmware *versions* through
 * a standard API — this is "did you check?" articleware, not an automated
 * version comparison.
 *
 * Card hides entirely when no EDID-reporting monitors are detected (KVM
 * passthroughs, virtual displays, headless rigs).
 */
export function MonitorFirmwareCard() {
  const isNative = inTauri()
  const [report, setReport] = useState<MonitorReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    if (!isNative) return
    setLoading(true)
    setErr(null)
    try {
      setReport(await monitorInventory())
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
  if (report && report.monitors.length === 0) return null

  return (
    <section className="surface-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">display · settings + firmware</p>
          <h2 className="text-lg font-semibold">Monitor settings + firmware check</h2>
          <p className="text-sm text-text-muted max-w-2xl leading-snug">
            We detect your panels via EDID and surface (1) the recommended competitive OSD
            settings for that exact model when we have a curated entry, and (2) the vendor's
            firmware-check page. EDID doesn't carry the firmware version itself — vendor tool
            is the source of truth for "is there an update."
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text text-xs font-semibold disabled:opacity-40"
        >
          {loading ? 'Probing…' : 'Refresh'}
        </button>
      </div>

      {err && <p className="text-xs text-red-300 italic">{err}</p>}

      {report && report.monitors.map((m, i) => {
        const optimal = findMonitorSettings(m.productCode, m.model)
        return (
          <div
            key={`${m.vendorCode}-${m.productCode}-${i}`}
            className="rounded-md border border-border p-4 space-y-2 bg-bg-raised/40"
          >
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                  {m.vendorName} · {m.vendorCode || 'no-PNP'}
                </p>
                <h3 className="text-base font-semibold truncate">
                  {m.model || '(no model in EDID)'}{' '}
                  {m.productCode && (
                    <span className="font-mono text-xs text-text-muted">[{m.productCode}]</span>
                  )}
                </h3>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-text-subtle">manufactured</p>
                <p className="text-sm tabular-nums text-text-muted">
                  {m.manufactureYear ? `${m.manufactureYear} · wk ${m.manufactureWeek ?? '?'}` : '—'}
                </p>
              </div>
            </div>

            {optimal && (
              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-[10px] uppercase tracking-widest text-accent font-semibold">
                  👑 {optimal.displayName}
                </p>
                <ul className="text-[11px] text-text-muted leading-snug space-y-1">
                  {optimal.settings.map((s) => (
                    <li key={s.label} className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-text-subtle uppercase tracking-widest text-[10px] min-w-[110px]">
                        {s.label}
                      </span>
                      <span className="text-text font-mono">{s.value}</span>
                      {s.why && <span className="text-text-subtle">— {s.why}</span>}
                    </li>
                  ))}
                </ul>
                {optimal.sourceUrl && (
                  <button
                    onClick={() => openExternal(optimal.sourceUrl!)}
                    className="text-[11px] underline text-text-muted hover:text-text"
                  >
                    {optimal.sourceLabel ?? 'Source'} ↗
                  </button>
                )}
              </div>
            )}

            {!optimal && (
              <p className="pt-2 border-t border-border text-[11px] text-text-subtle leading-snug">
                No curated competitive-OSD entry for this model yet. Defaults that work: refresh =
                native max, response time = "Fast" (NOT Extreme — overshoot), Game/FPS preset,
                HDR OFF, brightness 60-75. For competitive Fortnite at 240+ Hz with stable FPS
                above refresh, run <strong className="text-text">G-Sync OFF + V-Sync OFF +
                NVIDIA Reflex On+BOOST</strong> (pros prioritize the marginal latency over
                tear elimination). For lower-refresh monitors / unstable FPS, leave G-Sync ON
                and cap FPS 3 below refresh. DM the model to get a dedicated entry added.
              </p>
            )}

            <div className="pt-2 border-t border-border space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-text-subtle font-semibold">
                Firmware check
              </p>
              {m.firmwareUrl && m.firmwareTool ? (
                <>
                  <p className="text-[11px] text-text-muted leading-snug">
                    <strong className="text-text">Update tool:</strong> {m.firmwareTool}.
                    EDID doesn't carry firmware version, so we can't tell you if you're behind —
                    just where to look. {m.manufactureYear ? `Manufactured ${m.manufactureYear}` : 'Manufacture year unknown'} is informational only;
                    a 2019 monitor with current firmware is fine, a 2025 one without is not.
                  </p>
                  <button
                    onClick={() => openExternal(m.firmwareUrl!)}
                    className="text-[11px] underline text-accent hover:text-text"
                  >
                    Open vendor support page ↗
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-text-subtle leading-snug">
                  Vendor PNP code <code className="text-text-muted">{m.vendorCode || '(blank)'}</code>{' '}
                  not in our mapping table. Search "{m.model || m.productCode || 'monitor'} firmware update"
                  on the manufacturer's site directly.
                </p>
              )}
            </div>
          </div>
        )
      })}

      <p className="text-[11px] text-text-subtle leading-snug pt-2 border-t border-border">
        We don't warn based on manufacture year alone — a 2019 monitor with current firmware is
        fine, a 2025 one without is not. Use the firmware-check link to confirm you're current.
      </p>
    </section>
  )
}
