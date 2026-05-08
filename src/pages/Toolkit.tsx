import { useEffect, useState } from 'react'
import { NetworkLatencyCard } from '../components/NetworkLatencyCard'
import { ResearchCard } from '../components/ResearchCard'
import { RESEARCH } from '../lib/research'
import {
  diskFree,
  launchDiskCleanup,
  launchMemtest,
  readTemps,
  type DiskFreeRow,
  type ThermalSnapshot,
} from '../lib/tauri'

/** True iff window.__TAURI_INTERNALS__ is present — i.e. running inside Tauri shell. */
function inTauri(): boolean {
  // @ts-expect-error Tauri injects this at runtime
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export function Toolkit() {
  const [temps, setTemps] = useState<ThermalSnapshot | null>(null)
  const [tempsErr, setTempsErr] = useState<string | null>(null)
  const [disks, setDisks] = useState<DiskFreeRow[] | null>(null)
  const [disksErr, setDisksErr] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const isNative = inTauri()

  async function refreshTemps() {
    if (!isNative) {
      setTempsErr('Live thermal data only available inside the optimizationmaxxing.exe shell.')
      return
    }
    setTempsErr(null)
    try {
      const t = await readTemps()
      setTemps(t)
    } catch (e) {
      setTempsErr(formatErr(e))
    }
  }

  async function refreshDisks() {
    if (!isNative) {
      setDisksErr('Disk-space query only available inside the optimizationmaxxing.exe shell.')
      return
    }
    setDisksErr(null)
    try {
      const d = await diskFree()
      setDisks(d)
    } catch (e) {
      setDisksErr(formatErr(e))
    }
  }

  useEffect(() => {
    refreshTemps()
    refreshDisks()
    if (!isNative) return
    const t = setInterval(refreshTemps, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runDiskCleanup() {
    setActionMsg(null)
    try {
      await launchDiskCleanup()
      setActionMsg('cleanmgr.exe launched — switch to its window to pick targets.')
    } catch (e) {
      setActionMsg(formatErr(e))
    }
  }

  async function runMemtest() {
    setActionMsg(null)
    try {
      await launchMemtest()
      setActionMsg(
        'mdsched.exe launched — choose "Restart now and check" to start the boot-time memtest.',
      )
    } catch (e) {
      setActionMsg(formatErr(e))
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">utilities</p>
        <h1 className="text-2xl font-bold">Toolkit</h1>
        <p className="text-sm text-text-muted max-w-2xl">
          Live monitors, one-click utilities, and curated research. Beats both Paragon's "book a
          tech" and Hone's "trust us" with intel you can verify yourself.
        </p>
      </header>

      {actionMsg && (
        <div className="surface-card p-3 text-sm text-text">{actionMsg}</div>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Temps */}
        <div className="surface-card p-5 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-text-subtle">temps</p>
            <h2 className="text-lg font-semibold">Live thermal probes</h2>
          </div>
          {tempsErr && (
            <p className="text-xs text-text-muted italic">
              {tempsErr}
            </p>
          )}
          {temps && temps.probes.length === 0 && (
            <p className="text-sm text-text-muted">
              ACPI didn't return any thermal zones on this rig. Install LibreHardwareMonitor or
              HWInfo for full coverage; we'll wire it next pass.
            </p>
          )}
          {temps && temps.probes.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {temps.probes.map((p, i) => (
                <div key={i} className="border border-border rounded-md p-3 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                    {p.source}
                  </p>
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      p.celsius > 80
                        ? 'text-accent'
                        : p.celsius > 70
                        ? 'text-text'
                        : 'text-text'
                    }`}
                  >
                    {p.celsius.toFixed(1)}°
                  </p>
                </div>
              ))}
            </div>
          )}
          {temps && (
            <p className="text-[11px] text-text-subtle italic">{temps.disclaimer}</p>
          )}
        </div>

        {/* Disk free */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-text-subtle">storage</p>
              <h2 className="text-lg font-semibold">Disk space + cleanup</h2>
            </div>
            <button
              onClick={runDiskCleanup}
              disabled={!isNative}
              title={isNative ? undefined : 'Requires optimizationmaxxing.exe shell'}
              className="btn-chrome px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Disk Cleanup
            </button>
          </div>
          {disksErr && <p className="text-xs text-text-muted italic">{disksErr}</p>}
          {disks && disks.length === 0 && (
            <p className="text-sm text-text-muted">No fixed drives reported.</p>
          )}
          {disks && disks.length > 0 && (
            <div className="space-y-2">
              {disks.map((d) => (
                <div key={d.driveLetter} className="text-sm">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-text">
                      <span className="font-semibold">{d.driveLetter}</span>
                      {d.label ? (
                        <span className="text-text-muted"> · {d.label}</span>
                      ) : null}
                    </span>
                    <span className="text-text-muted text-xs tabular-nums">
                      {d.freeGb} / {d.sizeGb} GB free
                    </span>
                  </div>
                  <div className="h-1.5 bg-border rounded overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{ width: `${100 - d.freePercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <NetworkLatencyCard />

      <section className="surface-card p-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">network</p>
          <h2 className="text-lg font-semibold">Bufferbloat + latency tools</h2>
          <p className="text-sm text-text-muted">
            Outbound to gold-standard testers. Bufferbloat is the silent input-lag killer when your
            ISP under-buffers — measure before you tune router QoS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <a
            href="https://www.waveform.com/tools/bufferbloat"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text"
          >
            Waveform Bufferbloat ↗
          </a>
          <a
            href="https://www.dslreports.com/speedtest"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
          >
            DSLReports Speed+Buffer ↗
          </a>
          <a
            href="https://fast.com/"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
          >
            Netflix fast.com ↗
          </a>
          <a
            href="https://www.speedtest.net/apps/cli"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
          >
            Ookla CLI ↗
          </a>
        </div>
      </section>

      <section className="surface-card p-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">drivers</p>
          <h2 className="text-lg font-semibold">Driver advisor</h2>
          <p className="text-sm text-text-muted">
            We don't bundle stripped drivers — too risky to redistribute. We point you at the
            tools the tuning community actually trusts.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-text-muted">
          <div>
            <p className="font-semibold text-text mb-1">NVIDIA</p>
            <p>
              Use{' '}
              <a
                href="https://www.techpowerup.com/nvcleanstall/"
                target="_blank"
                rel="noopener"
                className="text-accent hover:underline"
              >
                NVCleanstall
              </a>{' '}
              from TechPowerUp. Picks the latest driver, lets you strip GeForce Experience +
              telemetry + USB-C audio + HD audio if you don't need them. Result: smaller
              installer, no background services.
            </p>
          </div>
          <div>
            <p className="font-semibold text-text mb-1">AMD</p>
            <p>
              Skip Adrenaline auto-install. Use{' '}
              <a
                href="https://www.amd.com/en/support"
                target="_blank"
                rel="noopener"
                className="text-accent hover:underline"
              >
                AMD's driver page
              </a>{' '}
              + DDU (Display Driver Uninstaller) in Safe Mode for clean swaps.
            </p>
          </div>
        </div>
        <p className="text-[11px] text-text-subtle italic">
          Why no auto-apply: stripped drivers vary per build and per chipset. A wrong combo can
          brick HDMI/audio output. We tell you the right tool; you decide the SKU.
        </p>
      </section>

      <section className="surface-card p-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">stability</p>
          <h2 className="text-lg font-semibold">Stability tests</h2>
          <p className="text-sm text-text-muted">
            Validate after RAM/BIOS changes. Don't skip — overclocks that look stable in 5
            minutes crash in hour-3 boss fights.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={runMemtest}
            disabled={!isNative}
            title={isNative ? undefined : 'Requires optimizationmaxxing.exe shell'}
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Windows MemTest (mdsched.exe)
          </button>
          <a
            href="https://www.karhusoftware.com/ramtest/"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
          >
            Karhu RamTest ($10) ↗
          </a>
          <a
            href="https://github.com/CoolCmd/TestMem5"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
          >
            TestMem5 ↗
          </a>
          <a
            href="http://www.numberworld.org/y-cruncher/"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
          >
            y-cruncher ↗
          </a>
          <a
            href="https://www.maxon.net/en/cinebench"
            target="_blank"
            rel="noopener"
            className="px-3 py-1.5 rounded-md border border-border hover:border-border-glow text-text-muted hover:text-text"
          >
            Cinebench R23 ↗
          </a>
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <p className="text-xs uppercase tracking-widest text-text-subtle">research</p>
          <h2 className="text-2xl font-bold">Curated guides</h2>
          <p className="text-sm text-text-muted">
            Deep-dives we keep updated. Each card expands to the full article.
          </p>
        </header>
        <div className="space-y-2">
          {RESEARCH.map((article) => (
            <ResearchCard key={article.id} article={article} />
          ))}
        </div>
      </section>
    </div>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
