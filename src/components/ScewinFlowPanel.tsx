import { useEffect, useState } from 'react'
import type { SpecProfile } from '../lib/tauri'
import { useRigStore } from '../store/useRigStore'

/**
 * SCEWIN read-only workflow panel. Renders above the SCEWIN guide
 * article in the same visual treatment as NvpiDownloadsPanel. Instead
 * of file downloads (SCEWIN is an AMI-licensed tool we don't ship),
 * each step has a copy-to-clipboard button for the exact command.
 *
 * Workflow surfaced:
 *   1. Export a text snapshot (read-only) — `SCEWIN_64.exe /o /s pre-tune.txt`
 *   2. Compare own snapshots for the same board revision and BIOS
 *   3. Make manual changes only in the vendor BIOS UI
 *   4. Re-export after reboot; missing fields remain unknown
 */

interface Step {
  num: string
  title: string
  blurb: string
  cmd?: string
  cmdNote?: string
  warning?: boolean
}

const STEPS: Step[] = [
  {
    num: '1',
    title: 'Export a text snapshot',
    blurb:
      'Read-only setup-script export; it is not every UEFI variable and may omit suppressed, hidden, or duplicate questions. Run in admin Command Prompt (not PowerShell). Save a backup off the rig.',
    cmd: 'SCEWIN_64.exe /o /s pre-tune.txt',
    cmdNote: 'Admin cmd.exe, run in the SCEWIN folder',
  },
  {
    num: '2',
    title: 'Diff against a reference',
    blurb:
      'Compare your own snapshots from the same board model, revision, and BIOS. Diagnostics can inspect two local text exports after a reboot. Missing records remain unknown; a teammate dump is not a safe template.',
    cmd: 'code --diff pre-tune.txt previous.txt',
    cmdNote: 'Use a text-diff tool; review changes one setting at a time',
  },
  {
    num: '3',
    title: 'Make manual changes only in BIOS UI',
    blurb:
      'Use the vendor BIOS UI for manual changes only. The memory worksheet keeps manual timing and voltage recipes as experimental references, not copy-paste settings: kit ICs, memory controller, board, BIOS, and cooling margin differ. Change one value at a time and validate stability. The app only reads the text export; never use SCEWIN import/write switches or write NVRAM.',
    warning: true,
  },
  {
    num: '4',
    title: 'Verify it actually committed',
    blurb:
      'Reboot, re-export with a new filename, and compare in Diagnostics. Only values reported in both files can be compared; missing or extra records need manual review and do not prove whether a setting is available or saved.',
    cmd: 'SCEWIN_64.exe /o /s post-tune.txt',
    cmdNote: 'Then diff post-tune.txt vs pre-tune.txt',
  },
]

export function ScewinFlowPanel() {
  const [copied, setCopied] = useState<string | null>(null)
  const spec = useRigStore((state) => state.spec)
  const ensureLoaded = useRigStore((state) => state.ensureLoaded)

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  function copy(cmd: string) {
    navigator.clipboard
      .writeText(cmd)
      .then(() => {
        setCopied(cmd)
        window.setTimeout(() => setCopied((c) => (c === cmd ? null : c)), 1800)
      })
      .catch(() => undefined)
  }

  return (
    <section
      className="surface-card p-5 space-y-3"
      style={{
        borderColor: 'var(--border-glow)',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, var(--bg-card) 100%)',
      }}
    >
      <div>
        <p className="text-[10px] uppercase tracking-widest text-accent">advanced — read-only workflow</p>
        <h3 className="text-base font-semibold">SCEWIN — read-only snapshot review, in 4 steps</h3>
        <p className="text-xs text-text-muted leading-snug mt-1 max-w-2xl">
          Export → compare → review → re-export. SCEWIN provides a text setup-script snapshot, not a
          complete or authenticated view of firmware. <strong className="text-text">Use it as partial read-only evidence.</strong>
          This app parses exports locally; it never executes SCEWIN or writes firmware/NVRAM.
        </p>
      </div>

      <RigPath spec={spec} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {STEPS.map((s) => (
          <div
            key={s.num}
            className={`rounded-md border p-3 space-y-2 ${
              s.warning
                ? 'border-amber-500/50 bg-amber-500/10'
                : 'border-border bg-bg-raised/40'
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl font-bold tabular-nums leading-none ${
                  s.warning ? 'text-amber-300' : 'text-accent'
                }`}
              >
                {s.num}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-text-subtle">step</span>
            </div>
            <h4 className={`text-sm font-semibold ${s.warning ? 'text-amber-200' : 'text-text'}`}>
              {s.title}
            </h4>
            <p className="text-[11px] text-text-muted leading-snug">{s.blurb}</p>

            {s.cmd && (
              <div className="space-y-1">
                <pre className="text-[11px] font-mono bg-bg-base/70 border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre">
                  <code>{s.cmd}</code>
                </pre>
                <div className="flex items-center justify-between gap-2">
                  {s.cmdNote && (
                    <span className="text-[10px] text-text-subtle italic">{s.cmdNote}</span>
                  )}
                  <button
                    onClick={() => copy(s.cmd!)}
                    className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border border-border hover:border-border-glow text-text-muted hover:text-text transition shrink-0"
                  >
                    {copied === s.cmd ? '✓ copied' : 'copy command'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-text-subtle leading-snug pt-2 border-t border-border">
        SCEWIN is an AMI-licensed tool — we don't redistribute it. Find a clean copy via vendor
        service tools or established TechPowerUp threads (VirusTotal-scan anything from an
        unofficial source).
      </p>
    </section>
  )
}

function RigPath({ spec }: { spec: SpecProfile | null }) {
  if (!spec) {
    return (
      <div className="rounded-md border border-border bg-bg-card/50 px-3 py-2 text-xs text-text-muted">
        Open this guide inside the desktop app to get a rig-specific checklist. In browser preview,
        start with a read-only dump and never import another board's settings blindly.
      </div>
    )
  }

  const intel = spec.cpu.vendor.toLowerCase().includes('intel')
  const laptop = spec.mobo.isLaptop
  const checklist = laptop
    ? 'OEM / laptop path: use the manufacturer BIOS UI and vendor service package. Do not import a desktop dump.'
    : intel
    ? 'Intel path: capture microcode, Intel Default Settings, security state, and memory context for review. Keep voltage, thermal, and power controls at vendor defaults.'
    : 'AMD path: capture memory context, CPPC/SMT state, and firmware version for review. Keep PBO, Curve Optimizer, SOC voltage, and power controls at vendor defaults.'

  return (
    <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 space-y-1 text-xs text-text-muted">
      <p className="text-[10px] uppercase tracking-widest text-accent">your starting anchor</p>
      <p className="text-text">{spec.cpu.marketing || spec.cpu.model} · {spec.mobo.manufacturer || 'unknown board'} {spec.mobo.product || ''}</p>
      <p>{checklist}</p>
      <p className="text-[11px] text-text-subtle">
        Current Windows: {spec.os.caption} build {spec.os.build} · RAM: {spec.ram.totalGb} GB{spec.ram.configuredSpeedMts ? ` @ ${spec.ram.configuredSpeedMts} MT/s` : ''}. Copy{' '}
        <strong className="text-text">Diagnostics → Copy snapshot</strong> before opening BIOS so the post-change result has a known baseline.
      </p>
    </div>
  )
}
