import { useState } from 'react'

/**
 * SCEWIN read-only workflow panel. Renders above the SCEWIN guide
 * article in the same visual treatment as NvpiDownloadsPanel. Instead
 * of file downloads (SCEWIN is an AMI-licensed tool we don't ship),
 * each step has a copy-to-clipboard button for the exact command.
 *
 * Workflow surfaced:
 *   1. Backup dump (read-only) — `SCEWIN_64.exe /o /s pre-tune.txt`
 *   2. Diff against a clean rig (any text-diff tool)
 *   3. Apply settings in BIOS UI (NOT via SCEWIN — brick risk)
 *   4. Verify by re-dumping after reboot — diff vs pre-tune.txt
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
    title: 'Dump BIOS to a file',
    blurb:
      'Read-only — every UEFI variable into one text file. Run in admin Command Prompt (not PowerShell). Save the file off the rig (USB / cloud) so it survives a non-POST recovery.',
    cmd: 'SCEWIN_64.exe /o /s pre-tune.txt',
    cmdNote: 'Admin cmd.exe, run in the SCEWIN folder',
  },
  {
    num: '2',
    title: 'Diff against a reference',
    blurb:
      'Compare against a teammate dump on the same chipset, or your own previous snapshot. Open both in any text-diff tool (VS Code, Beyond Compare, WinMerge, Notepad++ Compare). Variables that differ = your investigate-list for step 3.',
    cmd: 'code --diff pre-tune.txt teammate.txt',
    cmdNote: 'Or use any diff tool you trust',
  },
  {
    num: '3',
    title: 'Change settings in BIOS UI — never via SCEWIN',
    blurb:
      'SCEWIN can write back, but a malformed write can leave the board unable to POST (recovery = SPI flasher + BIOS chip reflash). Take your diff list into the BIOS itself. Change ONE setting at a time, reboot, validate (TestMem5 / OCCT). Hit Save & Exit, not Discard.',
    warning: true,
  },
  {
    num: '4',
    title: 'Verify it actually committed',
    blurb:
      'Reboot, re-dump with a new filename, diff vs your pre-tune file. Exactly your intended changes should differ — nothing else. Extra diffs = BIOS reset something (post-flash, CMOS event). Missing diffs = your change didn\'t save.',
    cmd: 'SCEWIN_64.exe /o /s post-tune.txt',
    cmdNote: 'Then diff post-tune.txt vs pre-tune.txt',
  },
]

export function ScewinFlowPanel() {
  const [copied, setCopied] = useState<string | null>(null)

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
        <h3 className="text-base font-semibold">SCEWIN — full BIOS audit, in 4 steps</h3>
        <p className="text-xs text-text-muted leading-snug mt-1 max-w-2xl">
          Dump → diff → change in BIOS → verify. SCEWIN gives you a plain-text snapshot of every
          UEFI variable on your board — the audit tool nothing else gives you. <strong className="text-text">Use it to
          read only.</strong> Writes via SCEWIN can brick the board (no recovery without an SPI flasher).
          All changes happen in the BIOS UI itself.
        </p>
      </div>

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
