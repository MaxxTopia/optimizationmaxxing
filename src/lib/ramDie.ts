/**
 * Turn an SPD read into a conservative vendor/profile signal for the read-only
 * RAM audit. SPD fields and density can suggest a family, but they do not prove
 * the exact die revision or a stable manual timing profile.
 *
 * Honest confidence tiers:
 *  - 'confident'   : the SPD vendor field is clear, not that a timing recipe is safe.
 *  - 'likely'      : vendor + density suggest a family; this remains an inference.
 *  - 'vendor-only' : we know the maker from SPD but not enough to name a die.
 */
import type { SpdDimm } from './tauri'

export type DieConfidence = 'confident' | 'likely' | 'vendor-only'

export interface DieResult {
  /** Real DRAM manufacturer read from SPD (e.g. "Nanya Technology", "SK Hynix"). */
  vendor: string
  /** Suggested family label for display, or '' when SPD is inconclusive. */
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
        note: 'SPD identifies SK Hynix, but it cannot prove A-die/M-die or a stable manual timing. Treat this as a display-only family hint.',
      }
    }
    if (v.includes('samsung')) {
      return { vendor, die: 'Samsung DDR5 family', confidence: 'likely', note: 'SPD identifies Samsung DDR5. The exact die revision and safe timings remain unverified.' }
    }
    if (v.includes('micron')) {
      return { vendor, die: '', confidence: 'vendor-only', note: 'SPD identifies Micron DDR5, but it does not establish a manual timing target. Keep the manufacturer profile or vendor defaults.' }
    }
    return { vendor: vendor || 'unknown', die: '', confidence: 'vendor-only', note: 'SPD does not identify enough information for a manual timing recommendation. Keep the manufacturer profile or vendor defaults.' }
  }

  // DDR4 — density can suggest a family, but the die revision is not proven by SPD.
  if (v.includes('nanya')) {
    return { vendor, die: 'Nanya family', confidence: 'confident', note: 'Nanya vendor field read from SPD; exact die revision and stability remain unverified.' }
  }
  if (v.includes('micron')) {
    const die = capGb >= 16 ? 'Micron Rev.B' : 'Micron Rev.E'
    return { vendor, die: `${die} family (inferred)`, confidence: 'likely', note: `Micron DDR4 family inferred from vendor and density (${die}); SPD does not prove the revision or a stable manual timing.` }
  }
  if (v.includes('hynix')) {
    const die = capGb >= 16 ? 'Hynix DJR' : 'Hynix CJR'
    return { vendor, die: `${die} family (inferred)`, confidence: 'likely', note: `SK Hynix DDR4 family inferred from vendor and density; SPD does not prove the revision or a stable manual timing.` }
  }
  if (v.includes('samsung')) {
    return { vendor, die: 'Samsung DDR4 family (inferred)', confidence: 'likely', note: 'Samsung DDR4 family inferred from vendor and kit context; exact die revision and stable timings remain unverified.' }
  }
  return { vendor: vendor || 'unknown', die: '', confidence: 'vendor-only', note: 'DRAM vendor read from SPD; exact die and stable timing behavior are not established by this read.' }
}
