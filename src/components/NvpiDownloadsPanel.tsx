import { useState } from 'react'
import {
  DRIVER_PROFILE_CATALOG,
  diffProfileText,
  profileForFilename,
  type ProfileTextDiff,
} from '../lib/driverProfiles'

/**
 * NVPI .nip profile download panel. Rendered above the NVPI guide
 * article. Uses fetch + Blob + URL.createObjectURL to trigger a real
 * file save in both browser dev and the Tauri webview — site-relative
 * <a download> links inside the markdown renderer also work for
 * keyboard users, but this panel surfaces the downloads visually with
 * clear "click here, file saves" buttons.
 */

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
    label: 'Fortnite — clean render lab',
    exes: 'FortniteClient-Win64-Shipping.exe, FortniteLauncher.exe',
    settingsCount: 7,
    experimental: true,
    blurb:
      'Seven-setting image-filter experiment. It does not remove foliage, clouds, terrain, or alter visibility. Keep only if your controlled test improves frame pacing without hurting clarity.',
  },
  {
    filename: 'valorant.nip',
    label: 'Valorant',
    exes: 'VALORANT-Win64-Shipping.exe, vgc.exe',
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
        <p className="text-[10px] uppercase tracking-widest text-accent">one-click downloads</p>
        <h3 className="text-base font-semibold">NVPI .nip profiles — pick a game, import in NVPI</h3>
        <p className="text-xs text-text-muted leading-snug mt-1 max-w-2xl">
          Download saves a <code>.nip</code>; it does not change your driver. In NVPI choose{' '}
          <strong className="text-text">File → Import Profile(s)</strong>, select the file,
          confirm the game's executable association, then click{' '}
          <strong className="text-text">Apply changes</strong>. Re-open the profile to verify it.
          Re-check after driver updates. These are test candidates, not guaranteed latency wins.
        </p>
        <p className="text-[11px] text-amber-200/90 leading-snug mt-2 max-w-2xl">
          These are driver profiles, not Fortnite file edits. We do not ship foliage/cloud/terrain
          removal, wall-visibility flags, memory edits, or anti-cheat bypasses. Use Fortnite's own
          Performance Mode and low-effects settings for the supported visual-minimum path.
        </p>
      </div>

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
        Saved to your browser's default download folder.
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
