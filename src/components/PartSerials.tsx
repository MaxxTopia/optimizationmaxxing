import { useState } from 'react'
import type { SpecProfile } from '../lib/tauri'

/**
 * Part-serials panel — consolidates the identifying serials the app already
 * detects (board, BIOS, drives, system UUID) into one place. Useful for
 * warranty claims and for spotting a part that was sold as "new" but carries a
 * serial that says otherwise (RMA/refurb/used). Read-only — it only surfaces
 * what Windows reports; it never changes anything.
 */
interface SerialRow {
  part: string
  detail: string
  serial: string | null
}

export function PartSerials({ spec }: { spec: SpecProfile }) {
  const rows: SerialRow[] = [
    {
      part: 'Motherboard',
      detail: [spec.mobo.manufacturer, spec.mobo.product].filter(Boolean).join(' ') || 'System board',
      serial: cleanSerial(spec.mobo.serialNumber),
    },
    {
      part: 'BIOS / UEFI',
      detail: spec.mobo.biosVersion || 'Firmware',
      serial: cleanSerial(spec.mobo.biosSerial),
    },
    {
      part: 'System UUID',
      detail: 'SMBIOS system identifier',
      serial: cleanSerial(spec.mobo.uuid),
    },
    {
      part: 'Memory',
      detail: [spec.ram.manufacturer, spec.ram.partNumber].filter(Boolean).join(' ') ||
        `${spec.ram.totalGb} GB (${spec.ram.stickCount} sticks)`,
      // WMI exposes RAM part number, not a per-stick serial.
      serial: spec.ram.partNumber ? '(part number — no serial exposed)' : null,
    },
    ...spec.storage.drives.map((d) => ({
      part: 'Drive',
      detail: `${d.model || 'Disk'} · ${d.sizeGb} GB · ${d.busKind}`,
      serial: cleanSerial(d.serial),
    })),
  ]

  return (
    <div className="surface-card p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <p className="text-xs uppercase tracking-widest text-text-subtle">part serials</p>
        <span className="text-[10px] uppercase tracking-widest text-text-subtle">read-only</span>
      </div>
      <h2 className="text-lg font-semibold mb-1">Hardware serial check</h2>
      <p className="text-xs text-text-muted mb-3 max-w-2xl leading-snug">
        Every serial Windows reports for your parts, in one place — handy for warranty claims and
        for catching a "new" part whose serial says it was refurbished or used.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <SerialLine key={i} row={r} />
        ))}
      </div>
    </div>
  )
}

function SerialLine({ row }: { row: SerialRow }) {
  const [copied, setCopied] = useState(false)
  const hasSerial = !!row.serial && !row.serial.startsWith('(')

  async function copy() {
    if (!hasSerial) return
    try {
      await navigator.clipboard.writeText(row.serial as string)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg-raised/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{row.part}</p>
        <p className="text-xs text-text-subtle truncate">{row.detail}</p>
      </div>
      <div className="text-right shrink-0">
        {row.serial ? (
          <button
            onClick={copy}
            disabled={!hasSerial}
            className={`font-mono text-xs break-all ${hasSerial ? 'text-text hover:text-accent' : 'text-text-subtle italic'}`}
            title={hasSerial ? 'Click to copy' : undefined}
          >
            {copied ? 'copied ✓' : row.serial}
          </button>
        ) : (
          <span className="text-xs text-text-subtle italic">not reported</span>
        )}
      </div>
    </div>
  )
}

/** Drop the placeholder junk BIOS/OEMs write when they leave a field blank so
 * we show "not reported" instead of a fake serial. */
function cleanSerial(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  const junk = new Set([
    'to be filled by o.e.m.',
    'default string',
    'none',
    'n/a',
    'not applicable',
    'not specified',
    'system serial number',
    '0',
    '00000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ])
  return junk.has(t.toLowerCase()) ? null : t
}
