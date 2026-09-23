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

        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-text-muted">
          <strong className="text-text">Fast NVCleanstall baseline:</strong> check{' '}
          <span className="text-emerald-300">Disable Installer Telemetry &amp; Advertising</span>,{' '}
          <span className="text-emerald-300">Perform a Clean Installation</span> when replacing or
          repairing a driver, <span className="text-emerald-300">Disable Ansel</span> if you do not
          use it, and <span className="text-emerald-300">Show Expert Tweaks</span>. Keep MSI on{' '}
          <strong className="text-text">Default</strong> policy/priority if you test it. Leave the
          experimental driver, container, HDCP, MPO, and NVENC-patch options off by default.
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
            <li>
              On the component page, keep <strong className="text-text">Display Driver</strong> and{' '}
              <strong className="text-text">PhysX System Software</strong>. Keep{' '}
              <strong className="text-text">HD Audio Driver</strong> only when audio leaves the GPU
              over HDMI or DisplayPort. Keep NVIDIA App, overlay, and capture components only if
              you actually use recording, filters, or the overlay. Do not remove NVIDIA Container
              if you use NVIDIA Control Panel or the NVIDIA App.
            </li>
            <li>
              <strong className="text-text">Recommended Installation Tweaks for a competitive
              desktop:</strong>
              <ul className="mt-2 space-y-1.5 border-l border-border pl-3 text-[13px]">
                <li><span className="font-semibold text-emerald-300">✓ CHECK</span> Disable Installer Telemetry &amp; Advertising. This is a privacy/installer choice, not a guaranteed FPS or input-latency tweak.</li>
                <li><span className="font-semibold text-emerald-300">✓ CHECK when replacing or repairing a driver</span> Perform a Clean Installation. Leave it off for a routine update if preserving NVIDIA profiles matters; export or note important settings first.</li>
                <li><span className="font-semibold text-emerald-300">✓ CHECK if you do not use Ansel</span> Disable Ansel. It removes an optional capture/photo feature, not a normal Fortnite requirement.</li>
                <li><span className="font-semibold text-emerald-300">✓ CHECK</span> Show Expert Tweaks so the choices are visible. This checkbox reveals options; it does not change driver behavior by itself.</li>
                <li><span className="font-semibold text-emerald-300">✓ OPTIONAL</span> Enable Message Signaled Interrupts, but keep Interrupt Policy and Interrupt Priority at <strong className="text-text">Default</strong>. Test the same game workload after reboot; turn it back off if stability, audio, or frame pacing worsens.</li>
                <li><span className="font-semibold text-emerald-300">✓ OPTIONAL, symptom-based</span> Disable NVIDIA HD Audio device sleep timer only if HDMI/DisplayPort audio goes to sleep, pops, or takes time to wake. It is not a baseline FPS tweak.</li>
              </ul>
            </li>
            <li>
              <strong className="text-text">Leave these unchecked for the baseline:</strong>
              <ul className="mt-2 space-y-1.5 border-l border-border pl-3 text-[13px]">
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Unattended Express Installation — it removes a chance to review the install and reboot behavior.</li>
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Add Hardware Support unless the installer specifically says your hardware needs it.</li>
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Enable DLSS Indicator unless you specifically want the in-game DLSS version label; it does not improve DLSS performance.</li>
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Disable Driver Telemetry (Experimental). It is not a proven latency win and can change driver compatibility/signing behavior; competitive machines should keep the supported path.</li>
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Disable NVIDIA Container. NVCleanstall warns that it breaks NVIDIA Control Panel.</li>
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Disable HDCP. It can break protected media and capture workflows without a competitive-game benefit.</li>
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Disable Multiplane Overlay (MPO), NVENC Video Encoding Session Limit Patch, and custom interrupt policy/priority. Use these only for a named display, capture, or creator-workflow problem, then validate and roll back if the symptom changes.</li>
                <li><span className="font-semibold text-amber-300">○ LEAVE OFF</span> Start external application unless you intentionally need NVCleanstall to launch a specific post-install tool.</li>
              </ul>
            </li>
            <li>Reboot and verify Fortnite, display/audio, capture, overlays, and NVIDIA Control Panel. Compare the same workload before and after; a smaller package or a checked box is not proof of lower input delay.</li>
          </ol>
          <p className="text-[11px] text-text-subtle italic pt-1 border-t border-border">
            <strong className="text-text-muted not-italic">Tournament safety:</strong> do not use a driver option that requires disabling Secure Boot, driver-signature enforcement, or other anti-cheat/security protections. If the install produces a warning, abort and use the official NVIDIA installer or restore the previous driver.
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
