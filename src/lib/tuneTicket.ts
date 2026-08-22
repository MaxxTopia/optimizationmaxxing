import { inTauri, kvGet, kvSet, vipHwid } from './tauri'

const STORAGE_KEY = 'optmaxxing-first-tune-ticket-v1'
const ENGINE_STORAGE_KEY = 'first_tune_ticket_v1'

export type TuneTicketRarity = 'gold' | 'emerald' | 'diamond'

export interface TuneTicket {
  id: string
  rarity: TuneTicketRarity
  chanceLabel: string
  price: 99 | 77 | 69
  issuedAt: string
  rigProof: string
}

const TIERS: Array<{
  rarity: TuneTicketRarity
  chance: number
  price: TuneTicket['price']
  color: string
}> = [
  { rarity: 'gold', chance: 70, price: 99, color: 'gold' },
  { rarity: 'emerald', chance: 24, price: 77, color: 'emerald' },
  { rarity: 'diamond', chance: 6, price: 69, color: 'diamond' },
]

export function readTuneTicket(): TuneTicket | null {
  try {
    return parseTicket(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

/**
 * Issue exactly one ticket on this installation. The local record prevents
 * repeat pulls during normal use; the short rig proof lets Diggy reject a
 * screenshot copied to a different machine. Server-side enforcement would be
 * required for a cryptographic guarantee, so the UI says that plainly.
 */
export async function issueTuneTicket(): Promise<TuneTicket> {
  const existing = readTuneTicket()
  if (existing) return existing

  // Tauri keeps a second copy in the app database. This survives a normal
  // localStorage clear and makes the one-pull rule stronger without pretending
  // that a client-only app can prevent a determined reinstall or DB deletion.
  if (inTauri()) {
    try {
      const persisted = parseTicket(await kvGet(ENGINE_STORAGE_KEY))
      if (persisted) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))
        return persisted
      }
    } catch {
      // Fall through to a manual/local ticket if the app database is unavailable.
    }
  }

  const roll = randomInt(100)
  const tier = roll < 70 ? TIERS[0] : roll < 94 ? TIERS[1] : TIERS[2]
  const issuedAt = new Date().toISOString()
  let binding = `LOCAL-${randomToken(6)}`
  if (inTauri()) {
    try {
      const hwid = await vipHwid()
      if (hwid) binding = `RIG-${hwid.slice(-8).toUpperCase()}`
    } catch {
      // A preview / offline shell still receives a visibly manual ticket.
    }
  }
  const ticket: TuneTicket = {
    id: `TUNE-${issuedAt.slice(0, 10).replaceAll('-', '')}-${randomToken(6)}`,
    rarity: tier.rarity,
    chanceLabel: `${tier.chance}% pull`,
    price: tier.price,
    issuedAt,
    rigProof: binding,
  }
  try {
    const serialized = JSON.stringify(ticket)
    localStorage.setItem(STORAGE_KEY, serialized)
    if (inTauri()) await kvSet(ENGINE_STORAGE_KEY, serialized)
  } catch {
    // The modal can still show the ticket for this session; no false claim of
    // permanent storage is made if the browser or app database blocks writes.
  }
  return ticket
}

export function tuneTicketMeta(rarity: TuneTicketRarity) {
  return TIERS.find((tier) => tier.rarity === rarity) ?? TIERS[0]
}

function randomInt(max: number): number {
  try {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    return bytes[0] % max
  } catch {
    return Math.floor(Math.random() * max)
  }
}

function randomToken(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}

function parseTicket(raw: string | null): TuneTicket | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<TuneTicket>
    if (
      !parsed.id ||
      (parsed.rarity !== 'gold' && parsed.rarity !== 'emerald' && parsed.rarity !== 'diamond') ||
      (parsed.price !== 99 && parsed.price !== 77 && parsed.price !== 69) ||
      !parsed.chanceLabel ||
      !parsed.rigProof
    ) return null
    return parsed as TuneTicket
  } catch {
    return null
  }
}
