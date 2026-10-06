import { useState } from 'react'
import { openWindowsSettingsPage, type WindowsSettingsPage } from '../lib/tauri'

interface Props {
  gpuVendor: string | null
}

const windowsSettingsLinks: { page: WindowsSettingsPage; label: string }[] = [
  { page: 'display', label: 'Display refresh rate' },
  { page: 'gameMode', label: 'Game Mode' },
  { page: 'gameBar', label: 'Game Bar' },
  { page: 'gameDvr', label: 'Captures' },
  { page: 'startupApps', label: 'Startup apps' },
  { page: 'ethernet', label: 'Ethernet' },
]

const setupSections = [
  {
    number: '01',
    title: 'Siege graphics and FPS cap',
    label: 'Set in game',
    points: [
      'Display: Fullscreen, native resolution, 100% render scale. Keep texture quality within available VRAM.',
      'Set shadows, reflections, and other costly effects Low; turn motion blur and optional lens effects Off.',
      'With VRR: enable G-SYNC/VRR, set NVIDIA Control Panel V-Sync On, in-game V-Sync Off, and cap 3 FPS below refresh (237 at 240 Hz).',
      'Without VRR, or if tearing is acceptable: V-Sync Off and uncapped for the lowest-latency path. Use only one limiter.',
    ],
  },
  {
    number: '02',
    title: 'NVIDIA game profile and shader cache',
    label: 'NVIDIA GPUs only',
    points: [
      'Siege: NVIDIA Reflex On + Boost when available. Boost holds higher clocks for lower latency at extra power and heat.',
      'NVIDIA Control Panel → Program Settings → Siege: Low Latency Mode Off/default when Reflex is enabled; Reflex takes priority over the driver queue option.',
      'Power management mode: Prefer maximum performance for Siege only, not globally. This holds higher clocks and uses more power.',
      'Leave Shader Cache Size at Driver Default/Driver Managed. Do not routinely clear it.',
      'Avoid global overrides. The app does not write NVIDIA driver profiles.',
    ],
  },
  {
    number: '03',
    title: 'Background apps and overlays',
    label: 'Close only what you do not use',
    points: [
      'Disable auto-start only for apps you recognize and do not need. Close unused recording/overlay apps before playing.',
      'Keep peripheral controls, audio, GPU driver components, and security tools you rely on.',
      'The preset does not mass-disable services or startup entries; that can break device controls and recording.',
    ],
  },
  {
    number: '04',
    title: 'Ethernet and network bindings',
    label: 'Stable link · no ping hacks',
    points: [
      'Use wired Ethernet. Keep IPv4, IPv6, QoS Packet Scheduler, and required driver bindings enabled; do not uncheck bindings blindly.',
      'On the active gaming Ethernet adapter, set Energy Efficient Ethernet / Green Ethernet Off and device power-down Off if available; this may use more idle power.',
          'RSS On, Jumbo Frames Off, other offloads at driver defaults. Do not force DSCP: a tag cannot improve a route that does not honor it.',
          'Path: open Ethernet above → Advanced network settings → More network adapter options. Use Properties for bindings, or Configure → Advanced / Power Management for the adapter controls.',
    ],
  },
  {
    number: '05',
    title: 'Thermals and frame-time stability',
    label: 'Safe limits stay on',
    points: [
      'Keep CPU/GPU thermal and power protections enabled. This pack does not change voltage, current limits, or fan curves.',
      'Use the PC maker’s performance fan profile and keep vents clear; never remove firmware safety limits.',
      'The Ultimate Performance plan reduces Windows power-plan idling on desktops; it cannot override firmware limits or guarantee higher FPS.',
    ],
  },
  {
    number: '06',
    title: '1% lows and frame pacing',
    label: 'Keep the render path consistent',
    points: [
      'Use one cap/sync path from section 01. Do not stack Siege, NVIDIA, RTSS, and overlay limiters.',
      'Keep enough free VRAM; lower costly effects before reducing display resolution.',
      'Do not force Realtime process priority, timer tweaks, or blanket service shutdowns; they can make frame pacing worse.',
    ],
  },
]

export function RainbowSixSiegePackGuide({ gpuVendor }: Props) {
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const isNvidia = gpuVendor?.toLowerCase().includes('nvidia') ?? false
  const showNvidiaGuidance = isNvidia || gpuVendor === null
  const visibleSections = setupSections.filter((section) =>
    section.label !== 'NVIDIA GPUs only' || showNvidiaGuidance,
  )

  return (
    <section
      id="rainbow-six-siege-guide"
      className="surface-card p-5 md:p-6 space-y-5 scroll-mt-6"
      aria-labelledby="rainbow-six-siege-guide-title"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs uppercase tracking-widest text-accent">free performance pack</p>
          <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-semibold text-accent">
            Rainbow Six Siege
          </span>
        </div>
        <h2 id="rainbow-six-siege-guide-title" className="text-xl font-bold text-text">
          Siege performance pack
        </h2>
        <p className="max-w-4xl text-sm leading-relaxed text-text-muted">
          This is a complete two-layer setup: one click applies the reversible settings this app can
          verify, and the cards below give the exact values for Siege, NVIDIA, overlays, NIC options,
          thermals, FPS caps, and frame pacing. Manual cards are never counted as applied. There are no
          benchmark or A/B-test steps, and rig detection skips settings the PC cannot support.
        </p>
      </header>

      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-text">Applied and verified by the preset</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
            Free · receipt-backed · revert available
          </span>
        </div>
        <ul className="mt-3 grid gap-3 text-sm text-text-muted sm:grid-cols-2 lg:grid-cols-3">
          <li><strong className="text-text">Highest supported display refresh</strong><br />Uses the current resolution and saves the prior display mode.</li>
          <li><strong className="text-text">Mouse acceleration off</strong><br />Sets predictable 1:1 Windows pointer movement; logs out to fully take effect.</li>
          <li><strong className="text-text">Game Mode on</strong><br />Keeps Windows’ game scheduling feature enabled.</li>
          <li><strong className="text-text">Game DVR and auto-capture off</strong><br />Stops background Windows recording. Xbox background clips will not be available.</li>
          <li><strong className="text-text">HAGS preference on</strong><br />Compatible Windows builds only; requires restart and a supporting graphics driver.</li>
          <li><strong className="text-text">Ultimate Performance power plan</strong><br />Desktop only. Revert restores the previous plan and removes only this app’s clone.</li>
          <li><strong className="text-text">Background power throttling off</strong><br />Removes EcoQoS throttling for background processes; it can increase idle power use.</li>
          <li><strong className="text-text">USB and HID power management off</strong><br />Reduces device power-state transitions for mice, keyboards, and controllers.</li>
          <li><strong className="text-text">Background-policy cleanup</strong><br />Disables Windows background app activity and Edge background mode; the app asks before the experimental policy.</li>
          <li><strong className="text-text">Recognized RGB startup entries off</strong><br />Targets known controller apps/tasks only; it does not kill overlays, audio, security, or GPU services.</li>
          <li><strong className="text-text">RSS on and Ethernet power saving off</strong><br />Uses the active physical adapters’ exposed controls and stores exact pre-state for rollback.</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-text-subtle">
          HAGS is a Windows preference and needs a supported graphics driver and restart. The plan is
          desktop-only. Ethernet and RGB actions are hardware-dependent and say “verified” only when the
          captured target state matches after the write. “Applied” means the requested setting was written
          and read back; it is not an FPS, ping, or latency guarantee. On laptops, the desktop power-plan
          clone is intentionally skipped; use the manufacturer’s plugged-in performance mode instead.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-text">Configured in the official game or driver controls</h3>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-200">
            Guided · not falsely counted
          </span>
        </div>
        <ul className="mt-3 grid gap-3 text-sm text-text-muted sm:grid-cols-2 lg:grid-cols-3">
          <li><strong className="text-text">Siege graphics</strong><br />Fullscreen, native resolution, 100% render scale, costly effects Low, and motion blur/lens effects Off.</li>
          <li><strong className="text-text">NVIDIA Reflex and profile</strong><br />Reflex On + Boost when available; Siege-only Prefer maximum performance; leave shader cache Driver Default.</li>
          <li><strong className="text-text">Overlays and startup</strong><br />Close recording and overlays you do not use, while keeping audio, GPU, peripheral, and security components you need.</li>
          <li><strong className="text-text">Advanced NIC bindings</strong><br />Keep IPv4, IPv6, QoS Packet Scheduler, and required driver bindings enabled; do not uncheck them blindly.</li>
          <li><strong className="text-text">Thermals and firmware</strong><br />Use the motherboard/GPU performance profile and clear airflow; safe firmware protections and fan curves stay in control.</li>
          <li><strong className="text-text">FPS cap and 1% lows</strong><br />Use one limiter. With VRR, start 3 FPS below refresh; keep the render path consistent instead of stacking limiters.</li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-text-subtle">
          The app cannot safely edit NVIDIA’s driver database, Siege’s per-account graphics file, arbitrary
          overlay processes, or firmware fan curves with a universal rollback guarantee. Those controls are
          still part of this pack, but the setup stays honest about who owns the setting.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-bg-base/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-text">Open the related Windows controls</h3>
            <p className="mt-1 text-xs text-text-muted">
              These shortcuts open Settings; they do not change the values for you.
            </p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
            Opens Windows Settings
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {windowsSettingsLinks.map(({ page, label }) => (
            <button
              key={page}
              type="button"
              onClick={() => {
                setSettingsError(null)
                void openWindowsSettingsPage(page).catch((error: unknown) => {
                  setSettingsError(error instanceof Error ? error.message : String(error))
                })
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-border-glow hover:text-text"
            >
              {label} ↗
            </button>
          ))}
        </div>
        {settingsError && (
          <p role="status" className="mt-2 text-xs text-accent">
            Could not open Windows Settings: {settingsError}
          </p>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {visibleSections.map((section) => (
          <article key={section.number} className="rounded-lg border border-border bg-bg-base/40 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 font-mono text-xs font-semibold text-accent">{section.number}</span>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="font-semibold text-text">{section.title}</h3>
                  <span className="text-[10px] uppercase tracking-wider text-text-subtle">{section.label}</span>
                </div>
                <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-text-muted marker:text-accent">
                  {section.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-bg-base/40 p-4">
        <h3 className="font-semibold text-text">Why some parts stay guided</h3>
        <p className="mt-2 text-sm leading-relaxed text-text-muted">
          {isNvidia
            ? 'Set the Siege and NVIDIA values above in the game and NVIDIA Control Panel. The apply button changes the verified Windows/NIC baseline; this guide covers the remaining game, driver, overlay, thermal, FPS-cap, and frame-pacing choices without pretending it changed them.'
            : gpuVendor
              ? `Detected GPU: ${gpuVendor}. NVIDIA-only steps are hidden. Game graphics, VRR, vendor driver settings, startup choices, and advanced NIC bindings stay in their official menus; the apply button changes the verified Windows/NIC baseline.`
              : 'Game graphics, VRR, driver settings, startup choices, and advanced NIC bindings stay in their official menus; the apply button changes the verified Windows/NIC baseline.'}
        </p>
      </div>

      <footer className="border-t border-border pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-subtle">Official references</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a className="text-accent hover:underline" href="https://www.ubisoft.com/en-us/help?article=000081045" target="_blank" rel="noreferrer">
            Ubisoft PC requirements (DirectX 12) ↗
          </a>
          <a className="text-accent hover:underline" href="https://www.nvidia.com/en-us/geforce/guides/system-latency-optimization-guide/" target="_blank" rel="noreferrer">
            NVIDIA Reflex, G-SYNC, and latency guidance ↗
          </a>
          <a className="text-accent hover:underline" href="https://www.nvidia.com/content/Control-Panel-Help/vLatest/en-gb/mergedProjects/nv3dENG/Manage_3D_Settings_%28reference%29.htm" target="_blank" rel="noreferrer">
            NVIDIA shader-cache reference ↗
          </a>
          <a className="text-accent hover:underline" href="https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmdt/ns-d3dkmdt-d3dkmt_wddm_2_7_caps" target="_blank" rel="noreferrer">
            Microsoft HAGS driver capability ↗
          </a>
          <a className="text-accent hover:underline" href="https://edc.intel.com/content/www/us/en/design/products/ethernet/adapters-and-devices-user-guide/other-power-options/" target="_blank" rel="noreferrer">
            Intel Ethernet power options ↗
          </a>
          <a className="text-accent hover:underline" href="https://edc.intel.com/content/www/us/en/design/products/ethernet/adapters-and-devices-user-guide/29.2/receive-side-scaling/" target="_blank" rel="noreferrer">
            Intel Receive Side Scaling ↗
          </a>
          <a className="text-accent hover:underline" href="https://edc.intel.com/content/www/us/en/design/products/ethernet/adapters-and-devices-user-guide/30.0/jumbo-frames/" target="_blank" rel="noreferrer">
            Intel Jumbo Frames ↗
          </a>
        </div>
      </footer>
    </section>
  )
}
