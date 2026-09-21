import { useEffect, useState } from 'react'
import { BufferbloatCard } from '../components/BufferbloatCard'
import { LiveThermalsCard } from '../components/LiveThermalsCard'
import { NetworkLatencyCard } from '../components/NetworkLatencyCard'
import { OnuStickCard } from '../components/OnuStickCard'
import {
  diskFree,
  launchDiskCleanup,
  launchMemtest,
  type DiskFreeRow,
} from '../lib/tauri'

/** True iff window.__TAURI_INTERNALS__ is present — i.e. running inside Tauri shell. */
function inTauri(): boolean {
  // @ts-expect-error Tauri injects this at runtime
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export function Toolkit() {
  const [disks, setDisks] = useState<DiskFreeRow[] | null>(null)
  const [disksErr, setDisksErr] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const isNative = inTauri()

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
    refreshDisks()
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
          Live monitors, one-click utilities, and curated research. Inspect the evidence, run the
          measurement, and keep only the change that improves your own rig.
        </p>
      </header>

      {actionMsg && (
        <div className="surface-card p-3 text-sm text-text">{actionMsg}</div>
      )}

      <LiveThermalsCard />

      <section className="surface-card p-5 space-y-3">
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
                    {d.label ? <span className="text-text-muted"> · {d.label}</span> : null}
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
      </section>

      <NetworkLatencyCard />

      <BufferbloatCard />

      <OnuStickCard />

      <section className="surface-card p-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">drivers</p>
          <h2 className="text-lg font-semibold">Driver advisor</h2>
          <p className="text-sm text-text-muted">
            We don't bundle stripped drivers — redistributing one wrong build for the wrong chipset bricks HDMI/audio. We tell you the right tool + the exact clicks.
          </p>
        </div>

        <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-text-muted">
          <strong className="text-text">When to use Driver Advisor:</strong> after a GPU or driver
          change, when the scan flags an old/known-problem version, or when diagnosing a repeatable
          driver symptom. A newer version alone is not a reason to change a stable tournament rig;
          compare the same workload before and after.
        </div>

        {/* NVIDIA — full step-by-step. A stripped install can reduce optional
            components, but the performance and compatibility tradeoff is
            driver-, feature-, and capture-workflow dependent. */}
        <div className="rounded-md border border-border p-4 space-y-3">
          <p className="font-semibold text-text">
            NVIDIA — official driver first; optional custom package{' '}
            <a
              href="https://www.techpowerup.com/nvcleanstall/"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              NVCleanstall
            </a>
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-sm text-text-muted">
            <li>
              Start with the current NVIDIA Game Ready driver from{' '}
              <a
                href="https://www.nvidia.com/Download/index.aspx"
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                NVIDIA's official download page
              </a>.
            </li>
            <li>Use NVCleanstall only if you specifically want to omit optional components. Read each component's effect first; removing NVIDIA App, capture/overlay, HD audio, Ansel, update, or HDCP support can remove features you rely on.</li>
            <li>Keep the driver and components you need. Do not disable HDCP or telemetry-related options on the assumption that they lower game latency; there is no guaranteed FPS or input-delay gain.</li>
            <li>Use a clean install/DDU for a corrupted driver or a troubleshooting/vendor-swap case, not as routine maintenance. NVCleanstall's clean-install option is not the same as DDU.</li>
            <li>Reboot and verify the game, display/audio, capture, and overlays you use. Measure before deciding to keep a stripped package.</li>
          </ol>
          <p className="text-[11px] text-text-subtle italic pt-1 border-t border-border">
            <strong className="text-text-muted not-italic">Measure the tradeoff:</strong> component and service changes vary by driver and selection. Smaller packages or fewer components do not by themselves prove lower DPC latency or input delay.
          </p>
        </div>

        <div className="rounded-md border border-border p-4 space-y-2 text-sm text-text-muted">
          <p className="font-semibold text-text mb-1">AMD</p>
          <p>
            Choose the AMD package and options you need from{' '}
            <a
              href="https://www.amd.com/en/support"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              AMD's driver page
            </a>
            . DDU is a troubleshooting tool for a corrupted install or a vendor swap, not a routine step for every driver update. After installation, verify your display, audio, recording, and game features.
          </p>
        </div>
      </section>

      <section className="surface-card p-5 space-y-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">stability</p>
          <h2 className="text-lg font-semibold">Stability tests</h2>
          <p className="text-sm text-text-muted">
            Validate after RAM/BIOS changes. Don't skip — tuning experiments that look stable in 5
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

      <section className="surface-card p-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-text-subtle">research moved</p>
          <h2 className="text-base font-semibold">Curated guides now live in /guides</h2>
          <p className="text-sm text-text-muted max-w-xl">
            Per-game callouts, advanced tracks (SCEWIN / overclocks), and OS comparison
            shipped 2026-05-08 — open the new page to filter by your title.
          </p>
        </div>
        <a
          href="/guides"
          className="px-3 py-1.5 rounded-md bg-accent text-bg-base text-xs font-semibold btn-chrome"
        >
          Open Guides →
        </a>
      </section>
    </div>
  )
}

function formatErr(e: unknown): string {
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  return JSON.stringify(e)
}
