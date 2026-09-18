/**
 * RAM Advisor — substring match against a conservative, read-only kit DB.
 *
 * Win32_PhysicalMemory.PartNumber is the canonical key. Real-world part
 * numbers vary in trailing digits (color/SKU) so we match by prefix, not
 * exact equality.
 */
import kitData from '../../resources/ram-kits.json'

export interface RamKitProfile {
  match: string
  brand: string
  model: string
  family: 'DDR4' | 'DDR5'
  profile_signal: string
  rated_speed_mts: number
  rated_timings: string
  rated_voltage_v: number
  stability_reference: string
  notes: string
}

interface KitDB {
  version: string
  kits: RamKitProfile[]
}

const db = kitData as unknown as KitDB

export function lookupKit(partNumber: string | null | undefined): RamKitProfile | null {
  if (!partNumber) return null
  const pn = partNumber.trim().toUpperCase()
  for (const kit of db.kits) {
    if (pn.includes(kit.match.toUpperCase())) return kit
  }
  return null
}

export const advisorVersion = db.version
export const advisorKitCount = db.kits.length
