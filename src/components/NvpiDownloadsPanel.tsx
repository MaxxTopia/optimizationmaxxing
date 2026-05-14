import { useState } from 'react'

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
  /** One-line "what's in it" tagline. */
  blurb: string
}

const PROFILES: NipProfile[] = [
  {
    filename: 'fortnite-pinnacle.nip',
    label: 'Fortnite — pinnacle',
    exes: 'FortniteClient-Win64-Shipping.exe, FortniteLauncher.exe',
    settingsCount: 14,
    highlight: true,
    blurb:
      'Threaded Optimization OFF (the UE5 stutter fix pros gatekeep), Power Mgmt Prefer Max, VSync force off, Texture filtering High Performance, FXAA + MFAA off, Pre-rendered frames 1, Ansel disabled, Smooth AFR off.',
  },
  {
    filename: 'valorant.nip',
    label: 'Valorant',
    exes: 'VALORANT-Win64-Shipping.exe, vgc.exe',
    settingsCount: 6,
    blurb: 'Power Mgmt Prefer Max, VSync off, Texture High Perf, Neg LOD Clamp, FXAA off, Pre-rendered = 1. Threaded Opt left at AUTO (Vanguard-cautious).',
  },
  {
    filename: 'cs2.nip',
    label: 'Counter-Strike 2',
    exes: 'cs2.exe',
    settingsCount: 6,
    blurb: 'Same 6-setting safe baseline as Valorant.',
  },
  {
    filename: 'apex-legends.nip',
    label: 'Apex Legends',
    exes: 'r5apex.exe, r5apex_dx12.exe',
    settingsCount: 6,
    blurb: 'Same baseline. Source engine integrates Reflex on its own — driver-side overrides stay minimal.',
  },
  {
    filename: 'marvel-rivals.nip',
    label: 'Marvel Rivals',
    exes: 'Marvel-Win64-Shipping.exe',
    settingsCount: 12,
    blurb:
      'UE5 (same engine family as Fortnite) — Threaded Optimization OFF for the main-thread stutter fix, Power Mgmt Prefer Max, VSync force-off, Texture filtering High Performance, FXAA + MFAA off, Pre-rendered frames 1, Ansel disabled.',
  },
]

export function NvpiDownloadsPanel() {
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

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
          Each profile binds to the game's <code>.exe</code> so NVPI auto-applies on launch. After
          download: <strong className="text-text">NVPI → File → Import Profile(s)</strong> →
          select the <code>.nip</code> → <strong className="text-text">Apply changes</strong> (green
          checkmark top-right). Every setting ID verified against Orbmu2k's source.
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
                {p.settingsCount} settings
              </span>
            </div>
            <p className="text-[11px] text-text-muted leading-snug">{p.blurb}</p>
            <p className="text-[10px] font-mono text-text-subtle break-all">
              Binds: {p.exes}
            </p>
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
