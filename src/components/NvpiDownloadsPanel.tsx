import { useState } from 'react'
import {
  DRIVER_PROFILE_CATALOG,
  diffProfileText,
  profileForFilename,
  type ProfileTextDiff,
} from '../lib/driverProfiles'

/**
 * NVPI setup and .nip profile download panel. Rendered above the NVPI
 * guide article. Uses fetch + Blob + URL.createObjectURL to trigger a
 * real file save in both browser dev and the Tauri webview. The importer
 * itself remains an explicit external download so the app never silently
 * installs or mutates a third-party driver tool.
 */

const NVPI_RELEASES_URL = 'https://github.com/Orbmu2k/nvidiaProfileInspector/releases'

interface NipProfile {
  filename: string
  label: string
  exes: string
  settingsCount: number
  highlight?: boolean
  experimental?: boolean
  /** One-line "what's in it" tagline. */
  blurb: string
}

const PROFILES: NipProfile[] = [
  {
    filename: 'fortnite-pinnacle.nip',
    label: 'Fortnite — latency baseline',
    exes: 'FortniteClient-Win64-Shipping.exe, FortniteLauncher.exe',
    settingsCount: 4,
    highlight: true,
    blurb:
      'Four driver-profile overrides to A/B as a starting point. They do not guarantee lower latency; compare the same Fortnite scene with Reflex, frame cap, and display settings held constant.',
  },
  {
    filename: 'fortnite-clean-render.nip',
    label: 'Fortnite — performance render lab',
    exes: 'FortniteClient-Win64-Shipping.exe, FortniteLauncher.exe',
    settingsCount: 9,
    experimental: true,
    blurb:
      'Nine-setting aggressive-but-standard driver experiment for the same Fortnite profile as the latency baseline. Import only one Fortnite variant at a time; it can add shimmer or image-quality loss and does not remove foliage, clouds, terrain, or alter visibility.',
  },
  {
    filename: 'valorant.nip',
    label: 'Valorant',
    exes: 'VALORANT-Win64-Shipping.exe',
    settingsCount: 6,
    blurb: 'Six driver-profile settings for a controlled test. Not an anti-cheat approval or a guaranteed latency improvement.',
  },
  {
    filename: 'cs2.nip',
    label: 'Counter-Strike 2',
    exes: 'cs2.exe',
    settingsCount: 6,
    blurb: 'Six driver-profile settings for a controlled test; compare against the game and driver defaults.',
  },
  {
    filename: 'apex-legends.nip',
    label: 'Apex Legends',
    exes: 'r5apex.exe, r5apex_dx12.exe',
    settingsCount: 6,
    blurb: 'Six driver-profile settings for a controlled test. Verify the executable association and in-game latency options.',
  },
  {
    filename: 'marvel-rivals.nip',
    label: 'Marvel Rivals',
    exes: 'Marvel-Win64-Shipping.exe',
    settingsCount: 12,
    blurb:
      'Twelve driver-profile settings. Engine-family similarity does not predict a Fortnite result; test this profile only in Marvel Rivals.',
  },
]

export function NvpiDownloadsPanel() {
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [compareFilename, setCompareFilename] = useState(PROFILES[0].filename)
  const [profileDiff, setProfileDiff] = useState<{
    fileName: string
    diff: ProfileTextDiff
  } | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)

  async function download(filename: string) {
    setBusy(filename)
    setErr(null)
    setDone(null)
    try {
      const res = await fetch(`/nvpi-profiles/${filename}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Defer revoke so the download has time to start
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      setDone(filename)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function compareExport(file: File | null) {
    if (!file) return
    setCompareError(null)
    setProfileDiff(null)
    try {
      const response = await fetch(`/nvpi-profiles/${compareFilename}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const shippedText = await response.text()
      const exportedText = await file.text()
      setProfileDiff({
        fileName: file.name,
        diff: diffProfileText(shippedText, exportedText),
      })
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section
      className="surface-card p-5 space-y-3"
      style={{
        borderColor: 'var(--border-glow)',
        background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.08) 0%, var(--bg-card) 100%)',
      }}
    >
      <div>
        <p className="text-[10px] uppercase tracking-widest text-accent">driver profile lab</p>
        <h3 className="text-base font-semibold">NVPI setup — backup, import, verify, apply</h3>
        <p className="text-xs text-text-muted leading-snug mt-1 max-w-2xl">
          NVPI is the separate importer that applies these files. Optimizationmaxxing never
          silently installs it or changes the NVIDIA driver database. Export your current profile
          first so you have a rollback file, then follow the same order every time.
        </p>
        <p className="text-[11px] text-amber-200/90 leading-snug mt-2 max-w-2xl">
          These are driver profiles, not Fortnite file edits. We do not ship foliage/cloud/terrain
          removal, wall-visibility flags, memory edits, or anti-cheat bypasses. Use Fortnite's own
          Performance Mode and low-effects settings for the supported visual-minimum path.
        </p>
      </div>

      <div className="rounded-md border border-accent/40 bg-accent/5 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-accent">step 1 · importer</p>
            <h4 className="text-sm font-semibold text-text">Download NVIDIA Profile Inspector</h4>
            <p className="text-[11px] text-text-muted leading-snug mt-1 max-w-xl">
              This opens the official Orbmu2k release page. Download the current Windows archive,
              extract it, and run <code>nvidiaProfileInspector.exe</code>.
            </p>
          </div>
          <a
            href={NVPI_RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            data-external="true"
            className="btn-chrome inline-flex items-center justify-center rounded-md bg-accent px-3 py-2 text-xs font-semibold text-bg-base whitespace-nowrap"
          >
            Download NVPI
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-text-muted leading-snug">
          <p><strong className="text-text">Before step 2:</strong> In NVPI export the current Fortnite profile and keep that <code>.nip</code> as your backup.</p>
          <p><strong className="text-text">Step 2:</strong> Download one profile below; it saves as a <code>.nip</code> in your normal Downloads folder.</p>
          <p><strong className="text-text">Step 3:</strong> In NVPI choose <strong className="text-text">File → Import Profile(s)</strong>. Select the file; do not paste its text into another field or double-click it.</p>
          <p><strong className="text-text">Step 4:</strong> When NVPI asks <strong className="text-text">Merge or Replace</strong>, choose <strong className="text-text">Merge</strong> for a normal test. Import only one Fortnite variant, confirm the executable names, then click <strong className="text-text">Apply changes</strong>. Close and reopen NVPI and export again to verify.</p>
        </div>
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-[11px] text-amber-100 leading-snug">
        <strong>Common NVPI warnings:</strong>
        <ul className="list-disc pl-4 mt-1 space-y-1">
          <li><strong>Application already in use:</strong> that executable is assigned to a different profile. Cancel, remove the old duplicate assignment (often an older “Fortnite (optimizationmaxxing)” profile), then import the current file into the <strong>Fortnite</strong> profile. Never keep the same game executable in two profiles.</li>
          <li><strong>Unknown format or XML error:</strong> re-download the file from the app and do not edit it in Word or a rich-text editor.</li>
          <li><strong>Apply/write failed:</strong> run NVPI as Administrator and confirm the NVIDIA driver/GPU is supported. Keep your exported backup until the values survive a close/reopen.</li>
        </ul>
      </div>

      <p className="text-[10px] uppercase tracking-widest text-text-subtle">step 2 · choose one profile</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PROFILES.map((p) => (
          <div
            key={p.filename}
            className={`rounded-md border p-3 space-y-2 ${
              p.highlight
                ? 'border-accent/60 bg-accent/5'
                : 'border-border bg-bg-raised/40'
            }`}
          >
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h4 className={`text-sm font-semibold ${p.highlight ? 'text-accent' : 'text-text'}`}>
                {p.label}
              </h4>
              <span className="text-[10px] uppercase tracking-widest text-text-subtle">
                {p.settingsCount} settings{p.experimental ? ' · lab' : ''} · r{profileForFilename(p.filename)?.revision ?? 1}
              </span>
            </div>
            <p className="text-[11px] text-text-muted leading-snug">{p.blurb}</p>
            <p className="text-[10px] font-mono text-text-subtle break-all">
              Executables in file (verify after import): {p.exes}
            </p>
            {profileForFilename(p.filename) && (
              <p className="text-[10px] text-text-subtle leading-snug">
                Reviewed {profileForFilename(p.filename)?.reviewedOn} · SHA-256{' '}
                <code>{profileForFilename(p.filename)?.sha256.slice(0, 12)}…</code>.{' '}
                {profileForFilename(p.filename)?.rollback[0]}
              </p>
            )}
            <button
              onClick={() => download(p.filename)}
              disabled={busy === p.filename}
              className={`mt-1 w-full px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                p.highlight
                  ? 'btn-chrome bg-accent text-bg-base'
                  : 'border border-border hover:border-border-glow text-text'
              } disabled:opacity-40`}
            >
              {busy === p.filename ? 'Downloading…' :
               done === p.filename ? `✓ saved · re-download` :
               `Download ${p.filename}`}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-1.5">
        <h4 className="text-sm font-semibold text-amber-200">For the mobile-style competitive look</h4>
        <p className="text-[11px] text-text-muted leading-snug">
          No NVPI profile controls Fortnite clouds or build geometry. In Fortnite itself, use the
          supported Performance rendering mode, low textures/effects/meshes where available,
          shadows and motion blur off, VSync off, and your tested Reflex/frame-cap combination.
          These choices can change by game version and event rules; hidden visibility settings do
          not belong in a competitive preset.
        </p>
      </div>

      {(() => {
        const nic = DRIVER_PROFILE_CATALOG.find((profile) => profile.kind === 'nic-advisory')
        if (!nic) return null
        return (
          <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold text-text">{nic.label}</h4>
              <span className="text-[10px] uppercase tracking-widest text-text-subtle">r{nic.revision} · reviewed {nic.reviewedOn}</span>
            </div>
            <p className="text-[11px] text-text-muted leading-snug">{nic.objective} The adapter driver decides which properties exist, so this remains a guided per-adapter review instead of a blind registry import.</p>
            <p className="text-[10px] text-amber-200/80 leading-snug">{nic.warnings.join(' ')}</p>
          </div>
        )
      })()}

      <div className="rounded-md border border-border bg-bg-base/40 p-3 space-y-2">
        <div>
          <h4 className="text-sm font-semibold text-text">Verify an exported profile</h4>
          <p className="text-[11px] text-text-muted leading-snug mt-1">
            Export the profile from NVIDIA Profile Inspector after importing or changing it, then
            compare it here. This is read-only: it never writes to the driver or edits your file.
            Keep the shipped download as the rollback source.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-text-muted" htmlFor="nvpi-compare-profile">
            Shipped baseline
          </label>
          <select
            id="nvpi-compare-profile"
            value={compareFilename}
            onChange={(event) => {
              setCompareFilename(event.target.value)
              setProfileDiff(null)
              setCompareError(null)
            }}
            className="rounded-md border border-border bg-bg-raised px-2 py-1 text-[11px] text-text"
          >
            {PROFILES.map((profile) => (
              <option key={profile.filename} value={profile.filename}>
                {profile.label}
              </option>
            ))}
          </select>
          <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-[11px] font-semibold text-text hover:border-border-glow">
            Choose exported .nip
            <input
              id="nvpi-compare-file"
              type="file"
              accept=".nip,.txt"
              className="sr-only"
              onChange={(event) => void compareExport(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {compareError && (
          <p className="text-[11px] text-red-300 leading-snug">
            Profile comparison failed: {compareError}
          </p>
        )}
        {profileDiff && (
          <div className="rounded-md border border-border bg-bg-raised/30 p-2 space-y-2">
            <p className="text-[11px] text-text-muted leading-snug">
              Compared <code>{profileDiff.fileName}</code> with{' '}
              <code>{compareFilename}</code>. Matching lines are omitted; this does not prove the
              driver accepted every setting.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <DiffLines
                title="Export-only lines"
                lines={profileDiff.diff.added}
                tone="text-amber-200"
              />
              <DiffLines
                title="Missing from export"
                lines={profileDiff.diff.removed}
                tone="text-red-300"
              />
            </div>
          </div>
        )}
      </div>

      {err && (
        <p className="text-[11px] text-red-300 leading-snug">
          Download failed: {err}. Right-click any button above and "Save link as…" as a fallback.
        </p>
      )}
      <p className="text-[10px] text-text-subtle leading-snug pt-2 border-t border-border">
        Files served from <code>/nvpi-profiles/</code> in the bundled app + on maxxtopia.com.
        Profile files save to your browser's default download folder; NVPI is downloaded separately
        from its official release page and must be imported and applied manually.
      </p>
    </section>
  )
}

function DiffLines({
  title,
  lines,
  tone,
}: {
  title: string
  lines: string[]
  tone: string
}) {
  const shown = lines.slice(0, 8)
  return (
    <div className="rounded border border-border bg-bg-base/50 p-2">
      <p className={`text-[10px] uppercase tracking-widest ${tone}`}>
        {title} · {lines.length}
      </p>
      {shown.length === 0 ? (
        <p className="text-[10px] text-text-subtle mt-1">None</p>
      ) : (
        <pre className="text-[10px] text-text-muted leading-snug whitespace-pre-wrap break-all mt-1">
          {shown.join('\n')}
          {lines.length > shown.length ? `\n… ${lines.length - shown.length} more` : ''}
        </pre>
      )}
    </div>
  )
}
