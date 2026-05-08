/**
 * RAM Advisor — substring match against curated kit DB.
 *
 * Win32_PhysicalMemory.PartNumber is the canonical key. Real-world part
 * numbers vary in trailing digits (color/SKU) so we match by prefix, not
 * exact equality.
 */
import kitData from '../../resources/ram-kits.json'

export interface TunableTarget {
  speed_mts: number
  timings: string
  voltage_v: number
  platform: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  notes: string
}

export interface RamKitProfile {
  match: string
  brand: string
  model: string
  family: 'DDR4' | 'DDR5'
  die_inferred: string
  rated_speed_mts: number
  rated_timings: string
  rated_voltage_v: number
  tunable_targets: TunableTarget[]
  tm5_config: string
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
