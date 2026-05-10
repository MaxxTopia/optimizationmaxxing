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
          Live monitors, one-click utilities, and curated research. Beats both Paragon's "book a
          tech" and Hone's "trust us" with intel you can verify yourself.
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

        {/* NVIDIA — full step-by-step. NVCleanstall is the biggest single
            driver-side win for an NVIDIA gaming rig: stripped install, no
            telemetry, no GFE background services. */}
        <div className="rounded-md border border-border p-4 space-y-3">
          <p className="font-semibold text-text">
            NVIDIA — install with{' '}
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
              Download NVCleanstall from TechPowerUp. Free, no install — just run the .exe as admin.
            </li>
            <li>
              <span className="text-text font-medium">Pick a driver:</span>{' '}
              <span className="text-text-muted">Latest production driver</span> (default — what you want for stability). Choose <span className="text-text-muted">latest beta</span> only if a specific game patch needs it.
            </li>
            <li>
              <span className="text-text font-medium">Components — strip everything except:</span>
              <ul className="mt-1 ml-2 list-disc pl-4 space-y-0.5 text-[13px]">
                <li><span className="text-text">Display Driver</span> — required, can't remove</li>
                <li><span className="text-text">PhysX System Software</span> — keep (UE4/UE5 games rely on it; Fortnite + most modern titles)</li>
                <li><span className="text-text">HD Audio Driver</span> — keep <em>only</em> if you use HDMI/DisplayPort audio. Otherwise strip — fewer kernel-mode drivers.</li>
                <li className="text-text-subtle">Strip everything else: GeForce Experience, NVIDIA Container, USB-C Audio, NVIDIA Update, nView, Telemetry — all background services with zero gaming benefit.</li>
              </ul>
            </li>
            <li>
              <span className="text-text font-medium">Tweaks page — enable these:</span>
              <ul className="mt-1 ml-2 list-disc pl-4 space-y-0.5 text-[13px]">
                <li>Disable Telemetry</li>
                <li>Disable Driver Telemetry</li>
                <li>Disable Installer Telemetry</li>
                <li>Disable Ansel (unless you use the photo mode)</li>
                <li>Disable HDCP (unless you stream Netflix-style protected content)</li>
                <li><span className="text-text">Perform a clean install</span> — wipes the existing driver before installing. Equivalent to running DDU first; do this every time unless you're patch-level updating.</li>
                <li><span className="text-text">Show extra tweaks</span> — flip this on so the above are visible.</li>
              </ul>
            </li>
            <li>
              Click <span className="text-text font-medium">Install</span> — downloads + strips + installs. ~3-5 min total.
            </li>
            <li>
              Reboot. Then open <a href="/guides/nvidia-profile-inspector" className="text-accent hover:underline">NVIDIA Profile Inspector</a> and apply the .nip profile for your game (Calypto for Fortnite). NVCleanstall handles the install hygiene; NVPI handles the per-game knobs NVCP never exposed.
            </li>
          </ol>
          <p className="text-[11px] text-text-subtle italic pt-1 border-t border-border">
            <strong className="text-text-muted not-italic">Why this beats the official installer:</strong> stock NVIDIA install ships ~700 MB of stuff a competitive rig never uses — Container service, ShadowPlay, GFE login, telemetry pings every boot. Stripped install is ~250 MB, zero background services. RAM idle drops 80-150 MB, plus you stop fighting GFE for the keybinds you actually want.
          </p>
        </div>

        <div className="rounded-md border border-border p-4 space-y-2 text-sm text-text-muted">
          <p className="font-semibold text-text mb-1">AMD</p>
          <p>
            Skip Adrenaline's auto-install (bundles a launcher + telemetry by default). Download the bare driver from{' '}
            <a
              href="https://www.amd.com/en/support"
              target="_blank"
              rel="noopener"
              className="text-accent hover:underline"
            >
              AMD's driver page
            </a>
            , and <strong className="text-text">use DDU (Display Driver Uninstaller) in Safe Mode</strong> for clean swaps between major versions. AMD doesn't have an NVCleanstall equivalent — DDU is the closest.
          </p>
        </div>
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
