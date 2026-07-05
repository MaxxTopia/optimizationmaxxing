/**
 * Turn an SPD read (real DRAM vendor, straight off the chip) into a die label
 * the secondary-timings advisor understands. This replaces guessing the die
 * from the marketing part number.
 *
 * Honest confidence tiers:
 *  - 'confident'   : die follows directly (e.g. Nanya, or a DDR5 vendor+stepping).
 *  - 'likely'      : real SPD vendor + density → best-guess die letter (DDR4 die
 *                    revisions aren't stored in SPD, so this is inference — but
 *                    seeded by the true vendor, not a name-guess).
 *  - 'vendor-only' : we know the maker from SPD but not enough to name a die.
 */
import type { SpdDimm } from './tauri'

export type DieConfidence = 'confident' | 'likely' | 'vendor-only'

export interface DieResult {
  /** Real DRAM manufacturer read from SPD (e.g. "Nanya Technology", "SK Hynix"). */
  vendor: string
  /** Die label that feeds the timings advisor, or '' when vendor-only. */
  die: string
  confidence: DieConfidence
  note: string
}

export function decodeDie(d: SpdDimm): DieResult {
  const vendor = (d.dramVendor || '').trim()
  const v = vendor.toLowerCase()
  const ddr5 = /ddr5/i.test(d.type)
  const capGb = d.capacityGb ?? 0

  if (ddr5) {
    if (v.includes('hynix')) {
      return {
        vendor,
        die: 'SK Hynix A-die',
        confidence: 'likely',
        note: "SK Hynix DDR5 is most often A-die. If the timings won't hold, it may be M-die — bump tRFC up a notch.",
      }
    }
    if (v.includes('samsung')) {
      return { vendor, die: 'Samsung B-die', confidence: 'likely', note: 'Samsung DDR5 is typically B-die. Samsung tunes looser than Hynix.' }
    }
    if (v.includes('micron')) {
      return { vendor, die: '', confidence: 'vendor-only', note: 'Micron DDR5 needs looser tuning than Hynix — keep XMP/EXPO and tighten cautiously.' }
    }
    return { vendor: vendor || 'unknown', die: '', confidence: 'vendor-only', note: 'DDR5 tRFC tuning is Hynix-specific — verify your die before tightening.' }
  }

  // DDR4 — the die letter isn't in SPD, but the vendor now is (real, not guessed).
  if (v.includes('nanya')) {
    return { vendor, die: 'Nanya', confidence: 'confident', note: 'Nanya DRAM read directly from SPD.' }
  }
  if (v.includes('micron')) {
    const die = capGb >= 16 ? 'Micron Rev.B' : 'Micron Rev.E'
    return { vendor, die, confidence: 'likely', note: `Micron DDR4 — ${die} by density (Rev.E on 8 Gb, Rev.B on 16 Gb sticks).` }
  }
  if (v.includes('hynix')) {
    const die = capGb >= 16 ? 'Hynix DJR' : 'Hynix CJR'
    return { vendor, die, confidence: 'likely', note: `SK Hynix DDR4 — likely ${die} by density.` }
  }
  if (v.includes('samsung')) {
    return { vendor, die: 'Samsung B-die', confidence: 'likely', note: 'Samsung DDR4 on a fast kit is usually B-die; low-speed kits can be C/D/E-die.' }
  }
  return { vendor: vendor || 'unknown', die: '', confidence: 'vendor-only', note: 'DRAM vendor read from SPD; the exact die needs Thaiphoon Burner to confirm.' }
}
