import { useMemo, useState } from 'react'
import {
  scewinParseDump,
  type BiosAudit,
  type ScewinDump,
  type ScewinEntry,
} from '../lib/tauri'

const MAX_IMPORT_BYTES = 10 * 1024 * 1024

interface Snapshot {
  fileName: string
  dump: ScewinDump
}

type SnapshotSlot = 'before' | 'after'

const COVERAGE_GROUPS = [
  { label: 'Memory profile', terms: ['xmp', 'expo', 'd.o.c.p', 'a-xmp', 'dram profile', 'memory profile'] },
  { label: 'Memory timings / frequency', terms: ['timing', 'cas latency', 'tcl', 'trcd', 'trp', 'tras', 'trfc', 'dram frequency', 'memory frequency'] },
  { label: 'CPU topology / boost', terms: ['smt', 'hyper-thread', 'hyperthread', 'core performance boost', 'precision boost', 'curve optimizer', 'pbo'] },
  { label: 'Boot / security', terms: ['secure boot', 'tpm', 'trusted platform', 'csm', 'boot mode'] },
  { label: 'PCIe / GPU', terms: ['resizable bar', 're-size bar', 'above 4g', 'pcie link', 'pcie speed'] },
  { label: 'Idle / power behavior', terms: ['c-state', 'c state', 'aspm', 'power supply idle', 'package state'] },
]

function normalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function canonicalManufacturer(value: string): string {
  const normalized = normalize(value)
  if (normalized.includes('asus')) return 'asus'
  if (normalized.includes('micro-star') || normalized.includes('msi')) return 'msi'
  if (normalized.includes('gigabyte') || normalized.includes('aorus')) return 'gigabyte'
  if (normalized.includes('asrock')) return 'asrock'
  return normalized
}

function identityConflicts(before: Snapshot, after: Snapshot): string[] {
  const fields: Array<[string, string | null | undefined, string | null | undefined, (v: string) => string]> = [
    ['board manufacturer', before.dump.identity?.boardManufacturer, after.dump.identity?.boardManufacturer, canonicalManufacturer],
    ['board model', before.dump.identity?.boardProduct, after.dump.identity?.boardProduct, normalize],
    ['board revision', before.dump.identity?.boardRevision, after.dump.identity?.boardRevision, normalize],
    ['BIOS version', before.dump.identity?.biosVersion, after.dump.identity?.biosVersion, normalize],
  ]
  return fields
    .filter(([, left, right, canonicalize]) => !!left && !!right && canonicalize(left) !== canonicalize(right))
    .map(([label]) => label)
}

function currentBoardConflicts(snapshot: Snapshot, audit: BiosAudit): string[] {
  const fields: Array<[string, string | null | undefined, string | null | undefined, (v: string) => string]> = [
    ['board manufacturer', snapshot.dump.identity?.boardManufacturer, audit.moboManufacturer, canonicalManufacturer],
    ['board model', snapshot.dump.identity?.boardProduct, audit.moboProduct, normalize],
    ['board revision', snapshot.dump.identity?.boardRevision, audit.moboRevision, normalize],
  ]
  return fields
    .filter(([, exported, detected, canonicalize]) => !!exported && !!detected && canonicalize(exported) !== canonicalize(detected))
    .map(([label]) => label)
}

function hasStrongPairIdentity(before: Snapshot, after: Snapshot): boolean {
  return [before, after].every((snapshot) =>
    !!snapshot.dump.identity?.boardManufacturer
      && !!snapshot.dump.identity?.boardProduct
      && !!snapshot.dump.identity?.boardRevision
      && !!snapshot.dump.identity?.biosVersion,
  )
}

function baseKey(key: string): string {
  return key.replace(/#\d+$/, '')
}

function keyCounts(entries: ScewinEntry[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    const key = baseKey(entry.comparisonKey)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

interface ComparedEntry {
  key: string
  before: ScewinEntry | null
  after: ScewinEntry | null
  status: 'changed' | 'unchanged' | 'unknown' | 'only-before' | 'only-after' | 'ambiguous'
}

function compareSnapshots(before: Snapshot, after: Snapshot): ComparedEntry[] {
  const beforeCounts = keyCounts(before.dump.entries)
  const afterCounts = keyCounts(after.dump.entries)
  const beforeByKey = new Map(before.dump.entries.map((entry) => [entry.comparisonKey, entry]))
  const afterByKey = new Map(after.dump.entries.map((entry) => [entry.comparisonKey, entry]))
  const allKeys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])]

  return allKeys.map((key) => {
    const beforeEntry = beforeByKey.get(key) ?? null
    const afterEntry = afterByKey.get(key) ?? null
    const base = baseKey(key)
    if ((beforeCounts.get(base) ?? 0) > 1 || (afterCounts.get(base) ?? 0) > 1) {
      return { key, before: beforeEntry, after: afterEntry, status: 'ambiguous' }
    }
    if (!beforeEntry) return { key, before: null, after: afterEntry, status: 'only-after' }
    if (!afterEntry) return { key, before: beforeEntry, after: null, status: 'only-before' }
    if (beforeEntry.currentValue == null || afterEntry.currentValue == null) {
      return { key, before: beforeEntry, after: afterEntry, status: 'unknown' }
    }
    return {
      key,
      before: beforeEntry,
      after: afterEntry,
      status: normalize(beforeEntry.currentValue) === normalize(afterEntry.currentValue) ? 'unchanged' : 'changed',
    }
  })
}

function decodeDump(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes)
  }

  const sampleLength = Math.min(bytes.length, 256)
  let evenNulls = 0
  let oddNulls = 0
  for (let i = 0; i < sampleLength; i += 1) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) evenNulls += 1
      else oddNulls += 1
    }
  }
  if (oddNulls > sampleLength / 5) return new TextDecoder('utf-16le').decode(bytes)
  if (evenNulls > sampleLength / 5) return new TextDecoder('utf-16be').decode(bytes)

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

function currentIdentityText(audit: BiosAudit): string {
  const board = [audit.moboManufacturer, audit.moboProduct, audit.moboRevision]
    .filter(Boolean)
    .join(' · ')
  const bios = [audit.biosVendor, audit.biosVersion].filter(Boolean).join(' ')
  return [board, bios ? `BIOS ${bios}` : null].filter(Boolean).join(' · ') || 'Board / BIOS identity not reported by Windows'
}

export function ScewinDumpInspector({ audit }: { audit: BiosAudit }) {
  const [before, setBefore] = useState<Snapshot | null>(null)
  const [after, setAfter] = useState<Snapshot | null>(null)
  const [confirmedSameFirmware, setConfirmedSameFirmware] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<SnapshotSlot, string>>>({})
  const [query, setQuery] = useState('')

  const pairConflicts = useMemo(
    () => before && after ? identityConflicts(before, after) : [],
    [before, after],
  )
  const detectedBoardConflicts = useMemo(
    () => [before, after].filter((snapshot): snapshot is Snapshot => !!snapshot)
      .flatMap((snapshot) => currentBoardConflicts(snapshot, audit)),
    [before, after, audit],
  )
  const hasIdentity = !!before && !!after && hasStrongPairIdentity(before, after)
  const canCompare = !!before && !!after && pairConflicts.length === 0 && detectedBoardConflicts.length === 0 && (hasIdentity || confirmedSameFirmware)
  const comparison = useMemo(
    () => canCompare && before && after ? compareSnapshots(before, after) : [],
    [canCompare, before, after],
  )
  const filteredComparison = useMemo(() => {
    const needle = normalize(query)
    if (!needle) return comparison
    return comparison.filter((item) => [item.before?.question, item.after?.question, item.before?.currentValue, item.after?.currentValue]
      .some((value) => value && normalize(value).includes(needle)))
  }, [comparison, query])

  async function importFile(slot: SnapshotSlot, file: File | undefined) {
    if (!file) return
    setErrors((previous) => ({ ...previous, [slot]: undefined }))
    setConfirmedSameFirmware(false)
    if (slot === 'before') setBefore(null)
    else setAfter(null)

    if (file.size > MAX_IMPORT_BYTES) {
      setErrors((previous) => ({ ...previous, [slot]: 'File exceeds the 10 MiB in-memory import limit.' }))
      return
    }

    try {
      let content = decodeDump(await file.arrayBuffer())
      if (content.includes('\0')) {
        throw new Error('Could not decode this file as plain text. Try exporting a text setup script from SCEWIN.')
      }
      const dump = await scewinParseDump(content)
      content = ''
      const snapshot = { fileName: file.name, dump }
      if (slot === 'before') setBefore(snapshot)
      else setAfter(snapshot)
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [slot]: typeof error === 'string' ? error : (error as Error).message ?? String(error),
      }))
    }
  }

  const counts = useMemo(() => comparison.reduce((result, item) => {
    result[item.status] += 1
    return result
  }, { changed: 0, unchanged: 0, unknown: 0, 'only-before': 0, 'only-after': 0, ambiguous: 0 }), [comparison])

  return (
    <div className="rounded-md border border-accent/30 bg-bg-raised/30 p-4 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-accent">Read-only firmware export</p>
        <h4 className="text-sm font-semibold">SCEWIN snapshot inspector</h4>
        <p className="text-[11px] text-text-muted leading-snug mt-1">
          Import two SCEWIN text exports to inspect reported values and compare a rebooted state. The parser runs locally in this app; it does not save or upload the raw dump, launch SCEWIN, or write BIOS/NVRAM.
        </p>
      </div>

      <div className="rounded border border-border bg-bg-card/50 px-3 py-2 space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-text-subtle">Windows-detected identity</p>
        <p className="text-[11px] text-text font-mono break-words">{currentIdentityText(audit)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(['before', 'after'] as const).map((slot) => {
          const snapshot = slot === 'before' ? before : after
          return (
            <div key={slot} className="rounded border border-border bg-bg-card/50 p-3 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-text-subtle">
                {slot === 'before' ? 'Before reboot / change' : 'After reboot / change'}
              </p>
              <label className="inline-flex cursor-pointer items-center rounded border border-border px-2.5 py-1 text-[11px] text-text hover:border-border-glow">
                Choose SCEWIN text export
                <input
                  type="file"
                  accept=".txt,.log,.cfg,text/plain"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0]
                    event.currentTarget.value = ''
                    void importFile(slot, file)
                  }}
                />
              </label>
              {snapshot && (
                <div className="text-[11px] text-text-muted break-words">
                  <p className="text-text">{snapshot.fileName}</p>
                  <p>{snapshot.dump.entries.length.toLocaleString()} settings parsed · {snapshot.dump.omittedSensitiveEntries} sensitive-name entries omitted</p>
                  {snapshot.dump.identity && (
                    <p className="font-mono mt-1">
                      {[snapshot.dump.identity.boardManufacturer, snapshot.dump.identity.boardProduct, snapshot.dump.identity.boardRevision, snapshot.dump.identity.biosVersion]
                        .filter(Boolean).join(' · ') || 'No board/BIOS metadata in file'}
                    </p>
                  )}
                </div>
              )}
              {errors[slot] && <p className="text-[11px] text-red-300">{errors[slot]}</p>}
            </div>
          )
        })}
      </div>

      {(pairConflicts.length > 0 || detectedBoardConflicts.length > 0) && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-200 space-y-1">
          <p className="font-semibold">Comparison blocked: exported identity conflicts.</p>
          {pairConflicts.length > 0 && <p>The two exports disagree on {pairConflicts.join(', ')}.</p>}
          {detectedBoardConflicts.length > 0 && <p>An export's board identity disagrees with Windows-detected hardware ({[...new Set(detectedBoardConflicts)].join(', ')}).</p>}
          <p>Do not compare setting values across different boards, board revisions, or BIOS versions.</p>
        </div>
      )}

      {before && after && hasIdentity && pairConflicts.length === 0 && detectedBoardConflicts.length === 0 && (
        <p className="rounded border border-border bg-bg-card/50 p-3 text-[11px] text-text-muted">
          Both exports report matching board maker, model, revision, and BIOS version. This is file metadata, not authenticated proof that the exports came from this PC.
        </p>
      )}

      {before && after && pairConflicts.length === 0 && detectedBoardConflicts.length === 0 && !hasIdentity && (
        <label className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] text-amber-100">
          <input
            type="checkbox"
            checked={confirmedSameFirmware}
            onChange={(event) => setConfirmedSameFirmware(event.currentTarget.checked)}
            className="mt-0.5"
          />
          <span>I verified these exports came from the same motherboard, board revision, and BIOS version. SCEWIN text often lacks authenticated hardware identity.</span>
        </label>
      )}

      {before && after && !canCompare && pairConflicts.length === 0 && detectedBoardConflicts.length === 0 && (
        <p className="text-[11px] text-text-subtle">Comparison stays locked until matching board/BIOS metadata is present or you confirm both files are from the same hardware and firmware.</p>
      )}

      {canCompare && (
        <>
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-amber-200 font-semibold">Export coverage — not BIOS availability</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {COVERAGE_GROUPS.map((group) => {
                const found = after!.dump.entries.filter((entry) => group.terms.some((term) => entry.question.toLocaleLowerCase().includes(term)))
                return (
                  <p key={group.label} className="text-[11px] text-text-muted">
                    <span className="text-text">{group.label}:</span>{' '}
                    {found.length ? `${found.length} matching record${found.length === 1 ? '' : 's'} listed` : 'not listed in this export'}
                  </p>
                )
              })}
            </div>
            <p className="text-[10px] text-text-subtle">A match means only that a question label appears in the export. “Not listed” does not mean hidden, unsupported, or unavailable in BIOS.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
            <span>{counts.changed} changed</span>
            <span>· {counts.unchanged} unchanged</span>
            <span>· {counts.unknown} value unknown</span>
            <span>· {counts['only-before'] + counts['only-after']} listed on one side only</span>
            <span>· {counts.ambiguous} ambiguous duplicate</span>
          </div>
          {(before.dump.identity?.biosVersion && after.dump.identity?.biosVersion && audit.biosVersion && normalize(after.dump.identity.biosVersion) !== normalize(audit.biosVersion)) && (
            <p className="text-[11px] text-amber-200">These snapshots match each other, but their BIOS version differs from the currently detected version. Treat the comparison as historical, not a read-back of the current firmware.</p>
          )}
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter setting names or values"
            className="w-full rounded border border-border bg-bg-base px-2 py-1.5 text-[11px] text-text placeholder:text-text-subtle"
          />
          <div className="max-h-72 overflow-auto rounded border border-border divide-y divide-border">
            {filteredComparison.slice(0, 300).map((item) => (
              <ComparisonRow key={item.key} item={item} />
            ))}
            {filteredComparison.length > 300 && (
              <p className="p-2 text-[10px] text-text-subtle">Showing 300 of {filteredComparison.length} matches. Narrow the filter to see more.</p>
            )}
            {filteredComparison.length === 0 && <p className="p-2 text-[11px] text-text-subtle">No settings match this filter.</p>}
          </div>
        </>
      )}

      <p className="text-[10px] text-text-subtle leading-snug">
        Values are best-effort parsing of a text export, not live firmware read-back. Conflicting/ambiguous values remain unknown; settings omitted by SCEWIN cannot be classified. Validate any manual firmware change against the board vendor's documentation and stability tests.
      </p>
    </div>
  )
}

function ComparisonRow({ item }: { item: ComparedEntry }) {
  const title = item.after?.question ?? item.before?.question ?? 'Unnamed setting'
  const statusLabels: Record<ComparedEntry['status'], string> = {
    changed: 'changed',
    unchanged: 'unchanged',
    unknown: 'unknown value',
    'only-before': 'only in before export',
    'only-after': 'only in after export',
    ambiguous: 'duplicate — not compared',
  }
  const statusColor = item.status === 'changed' ? 'text-amber-200' : item.status === 'unchanged' ? 'text-emerald-300' : 'text-text-subtle'
  const beforeText = item.before?.currentValue ?? (item.before ? 'not reported' : 'not listed')
  const afterText = item.after?.currentValue ?? (item.after ? 'not reported' : 'not listed')
  return (
    <div className="px-2.5 py-2 text-[11px] space-y-0.5">
      <div className="flex items-start gap-2">
        <span className="text-text font-medium flex-1 break-words">{title}</span>
        <span className={`shrink-0 ${statusColor}`}>{statusLabels[item.status]}</span>
      </div>
      <p className="text-text-muted break-words">Before: {beforeText} <span className="text-text-subtle">→</span> After: {afterText}</p>
      {(item.status === 'only-before' || item.status === 'only-after') && (
        <p className="text-[10px] text-text-subtle">One export does not list this record; that alone does not establish BIOS availability.</p>
      )}
    </div>
  )
}
