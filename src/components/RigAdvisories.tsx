import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { kvGet, type SpecProfile } from '../lib/tauri'

/**
 * Spec-aware advisory cards. Each renders only when it applies to the
 * detected rig, so a Radeon user sees Radeon guidance, an Intel-APO-eligible
 * CPU gets the "is your best free lever on?" nudge, etc. All cards link out
 * to a guide or an in-app page — none auto-apply anything. Added v0.2.7 to
 * close the NVIDIA-desktop-centric coverage gap.
 */

interface Props {
  spec: SpecProfile | null
}

interface Advisory {
  key: string
  eyebrow: string
  title: string
  body: string
  to: string
  cta: string
  tone?: 'info' | 'warn'
}

// Win11 starts at build 22000; anything 1..21999 is Windows 10 (EOL 2025-10-14).
function isWindows10(build: number): boolean {
  return build > 0 && build < 22000
}

function buildAdvisories(spec: SpecProfile): Advisory[] {
  const out: Advisory[] = []
  const cpuVendor = (spec.cpu.vendor || '').toLowerCase()
  const gpuVendor = (spec.gpu.vendor || '').toLowerCase()
  const cpuStr = `${spec.cpu.model || ''} ${spec.cpu.marketing || ''}`.toLowerCase()
  const gen = spec.cpu.genOrZen ?? 0

  // ── GPU vendor fork ────────────────────────────────────────────────
  if (gpuVendor.includes('amd') || gpuVendor.includes('radeon')) {
    out.push({
      key: 'gpu-amd',
      eyebrow: 'your GPU · Radeon',
      title: 'Radeon low-latency setup (not the NVIDIA path)',
      body: 'Use the anti-cheat-safe Anti-Lag 2 (CS2), turn OFF Chill / Boost / HYPR-RX for competitive, and never force the old Anti-Lag+ (it VAC-banned people). Radeon-specific guide inside.',
      to: '/guides#amd-radeon-adrenalin',
      cta: 'Open Radeon guide →',
    })
  } else if (gpuVendor.includes('intel') || gpuVendor.includes('arc')) {
    out.push({
      key: 'gpu-arc',
      eyebrow: 'your GPU · Intel Arc',
      title: 'Arc: check Resizable BAR first',
      body: 'ReBAR is worth ~20-40% on Arc and is the #1 knob. Stay on current drivers (Arc gains come from updates), and use XeLL for latency — skip frame-gen for competitive.',
      to: '/guides#intel-arc-setup',
      cta: 'Open Arc guide →',
    })
  } else if (gpuVendor.includes('nvidia')) {
    out.push({
      key: 'gpu-nv',
      eyebrow: 'your GPU · NVIDIA',
      title: 'NVIDIA: Reflex + the gatekept .nip knobs',
      body: 'Reflex On+Boost and the per-game NVIDIA Profile Inspector tweaks (Threaded Optimization, FRL v3) are the real latency wins NVCP never exposes.',
      to: '/guides#nvidia-profile-inspector',
      cta: 'Open NVIDIA guide →',
    })
  }

  // ── CPU first-party levers ─────────────────────────────────────────
  // Intel APO: Arrow Lake (Core Ultra 200) or 14th-gen K-series.
  const looksArrowLake = cpuStr.includes('ultra')
  if (cpuVendor.includes('intel') && (gen >= 14 || looksArrowLake)) {
    out.push({
      key: 'cpu-apo',
      eyebrow: 'your CPU · Intel',
      title: 'Intel APO may be your biggest free FPS lever',
      body: 'Application Optimization (14th-gen K / Core Ultra 200) reorders P/E-core threads per game — up to ~14% FPS and ~21% better 1% lows in supported titles like CS2. Most people never enable it. Check the APO app.',
      to: '/guides#amd-intel',
      cta: 'How to enable APO →',
    })
  }

  // AMD X3D dual-CCD parking health.
  if (cpuVendor.includes('amd') && cpuStr.includes('x3d')) {
    out.push({
      key: 'cpu-x3d',
      eyebrow: 'your CPU · AMD X3D',
      title: 'Make sure games land on the V-Cache cores',
      body: 'On X3D chips the biggest real lever is the 3D V-Cache Optimizer driver + Xbox Game Bar / Game Mode parking the non-cache cores. Verify it in Task Manager. (Single-CCD 7800X3D/9800X3D is automatic.) Don\'t manually pin affinity anymore.',
      to: '/guides#amd-intel',
      cta: 'Verify X3D scheduling →',
    })
  }

  // ── Windows 10 EOL advisory ────────────────────────────────────────
  if (isWindows10(spec.os.build)) {
    out.push({
      key: 'os-eol',
      eyebrow: 'your OS · Windows 10',
      title: 'Windows 10 reached end of support (Oct 14, 2025)',
      body: 'Your tweaks still apply, but Win10 no longer gets security fixes, and Win11 24H2 has real hybrid-CPU scheduler gains. Worth planning an upgrade (or ESU). Per-game OS notes inside.',
      to: '/guides#per-game-windows',
      cta: 'OS guidance →',
      tone: 'warn',
    })
  }

  return out
}

export function RigAdvisories({ spec }: Props) {
  const [drift, setDrift] = useState<{ from: number; to: number } | null>(null)

  useEffect(() => {
    if (!spec) return
    let cancelled = false
    kvGet('last_applied_build')
      .then((v) => {
        if (cancelled || !v) return
        const last = parseInt(v, 10)
        if (Number.isFinite(last) && spec.os.build > last) {
          setDrift({ from: last, to: spec.os.build })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [spec])

  if (!spec) return null
  const advisories = buildAdvisories(spec)
  if (!drift && advisories.length === 0) return null

  return (
    <section className="space-y-3">
      <header>
        <p className="text-xs uppercase tracking-widest text-text-subtle">tuned for your setup</p>
        <h2 className="text-2xl font-bold">Rig-specific advisories</h2>
        <p className="text-sm text-text-muted">
          Surfaced from your detected hardware + OS. These point you at the right guidance — nothing
          here changes your system on its own.
        </p>
      </header>

      {drift && (
        <div className="surface-card p-5 border-l-4 border-accent">
          <p className="text-xs uppercase tracking-widest text-accent">windows updated since you last tuned</p>
          <h3 className="text-lg font-semibold mt-1">
            Build {drift.from} → {drift.to} — some tweaks may have been reverted
          </h3>
          <p className="text-sm text-text-muted mt-1">
            Windows feature/cumulative updates can silently undo tweaks and re-enable telemetry/services.
            Re-check what changed and re-apply anything that drifted.
          </p>
          <Link
            to="/diff"
            className="inline-block mt-3 btn-chrome px-4 py-2 rounded-md bg-accent text-bg-base font-semibold text-sm"
          >
            Re-check my tweaks →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {advisories.map((a) => (
          <div
            key={a.key}
            className={`surface-card p-5 ${a.tone === 'warn' ? 'border-l-4 border-amber-500/70' : ''}`}
          >
            <p className="text-xs uppercase tracking-widest text-text-subtle">{a.eyebrow}</p>
            <h3 className="text-base font-semibold mt-1">{a.title}</h3>
            <p className="text-sm text-text-muted mt-1">{a.body}</p>
            <Link to={a.to} className="inline-block mt-3 text-sm text-accent hover:underline">
              {a.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
